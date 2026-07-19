import { createHash } from 'node:crypto'

import type { SpoolOsFamily } from '../../shared/spool/spool-wire-contract'
import type { SpoolProbeClient } from './spool-probe-client'
import type { TailnetControl, TailnetNode } from './tailnet-control'

const PEER_RECONCILE_INTERVAL_MS = 5_000
const PEER_PROBE_CONCURRENCY = 8
const MISSED_RECONCILIATIONS_BEFORE_REMOVAL = 2

export type DiscoveredSpoolDesktop = {
  desktopRef: string
  tailnetNodeId: string
  userDisplayName: string
  nodeDisplayName: string
  address: string
  protocolVersion: number
  ownerRuntimeId: string
  ownerKeyFingerprint: string
  ownerPublicKeyB64: string
  yiruVersion: string
  osFamily: SpoolOsFamily
}

type ReconciledDesktop = {
  desktop: DiscoveredSpoolDesktop
  missedReconciliations: number
}

export type TailnetPeerDirectory = {
  snapshot(): readonly DiscoveredSpoolDesktop[]
  subscribe(listener: (snapshot: readonly DiscoveredSpoolDesktop[]) => void): () => void
  start(): void
  stop(): void
}

export class DefaultTailnetPeerDirectory implements TailnetPeerDirectory {
  private readonly desktopsByNode = new Map<string, ReconciledDesktop>()
  private readonly listeners = new Set<(snapshot: readonly DiscoveredSpoolDesktop[]) => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private reconciliation: Promise<void> | null = null
  private stopped = true

  constructor(
    private readonly tailnet: TailnetControl,
    private readonly probeClient: SpoolProbeClient
  ) {}

  snapshot(): readonly DiscoveredSpoolDesktop[] {
    return [...this.desktopsByNode.values()].map(({ desktop }) => ({ ...desktop }))
  }

  subscribe(listener: (snapshot: readonly DiscoveredSpoolDesktop[]) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (!this.stopped) {
      return
    }
    this.stopped = false
    void this.reconcile()
    this.timer = setInterval(() => void this.reconcile(), PEER_RECONCILE_INTERVAL_MS)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.desktopsByNode.size > 0) {
      this.desktopsByNode.clear()
      this.emit()
    }
  }

  private reconcile(): Promise<void> {
    if (this.reconciliation) {
      return this.reconciliation
    }
    const active = this.performReconciliation().finally(() => {
      if (this.reconciliation === active) {
        this.reconciliation = null
      }
    })
    this.reconciliation = active
    return active
  }

  private async performReconciliation(): Promise<void> {
    if (this.stopped) {
      return
    }
    let peers: readonly TailnetNode[]
    try {
      peers = (await this.tailnet.readSnapshot()).peers
    } catch {
      if (this.recordMisses(new Set())) {
        // Why: after two failed passes, subscribers must close the stale
        // requester connection instead of retaining an offline Desktop row.
        this.emit()
      }
      return
    }
    const successfulNodes = new Set<string>()
    await runWithConcurrency(
      peers.filter((peer) => peer.online !== false),
      PEER_PROBE_CONCURRENCY,
      async (peer) => {
        const desktop = await this.probePeer(peer)
        if (!desktop || this.stopped) {
          return
        }
        successfulNodes.add(desktop.tailnetNodeId)
        const existing = this.desktopsByNode.get(desktop.tailnetNodeId)
        const changed = !existing || !desktopsEqual(existing.desktop, desktop)
        this.desktopsByNode.set(desktop.tailnetNodeId, {
          desktop,
          missedReconciliations: 0
        })
        if (changed) {
          // Why: reachable Desktops should appear as soon as their probe succeeds,
          // without waiting for unrelated offline Tailnet peers to time out.
          this.emit()
        }
      }
    )
    if (this.stopped) {
      return
    }
    if (this.recordMisses(successfulNodes)) {
      this.emit()
    }
  }

  private async probePeer(peer: TailnetNode): Promise<DiscoveredSpoolDesktop | null> {
    for (const address of peer.addresses) {
      try {
        const admission = await this.probeClient.probe(address)
        const response = admission.response
        return {
          desktopRef: createDesktopRef(
            peer.nodeId,
            response.ownerKeyFingerprint,
            response.ownerRuntimeId
          ),
          tailnetNodeId: peer.nodeId,
          userDisplayName: peer.userDisplayName,
          nodeDisplayName: peer.nodeDisplayName,
          address,
          protocolVersion: response.protocolVersion,
          ownerRuntimeId: response.ownerRuntimeId,
          ownerKeyFingerprint: response.ownerKeyFingerprint,
          ownerPublicKeyB64: response.ownerPublicKeyB64,
          yiruVersion: response.yiruVersion,
          osFamily: response.osFamily
        }
      } catch {
        // The next advertised address may still carry a reachable Tailnet route.
      }
    }
    return null
  }

  private recordMisses(successfulNodes: ReadonlySet<string>): boolean {
    let changed = false
    for (const [nodeId, entry] of this.desktopsByNode) {
      if (successfulNodes.has(nodeId)) {
        continue
      }
      entry.missedReconciliations++
      if (entry.missedReconciliations >= MISSED_RECONCILIATIONS_BEFORE_REMOVAL) {
        this.desktopsByNode.delete(nodeId)
        changed = true
      }
    }
    return changed
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function createDesktopRef(nodeId: string, keyFingerprint: string, runtimeId: string): string {
  return createHash('sha256')
    .update(`${nodeId}\0${keyFingerprint}\0${runtimeId}`)
    .digest('base64url')
}

function desktopsEqual(left: DiscoveredSpoolDesktop, right: DiscoveredSpoolDesktop): boolean {
  return Object.keys(left).every(
    (key) =>
      left[key as keyof DiscoveredSpoolDesktop] === right[key as keyof DiscoveredSpoolDesktop]
  )
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++
      await operation(values[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
}
