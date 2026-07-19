import type { SpoolRemoteDesktop } from '../../shared/spool/spool-catalog-contract'
import type {
  SpoolRequesterControlView,
  SpoolRequesterInvokeArgs,
  SpoolRequesterSubscriptionArgs
} from '../../shared/spool/spool-ipc-contract'
import {
  cancelSpoolCatalogSessionLoad,
  reconcileSpoolCatalogSessionLoad
} from './spool-catalog-session-loader'
import { isSpoolDesktopCatalog } from './spool-catalog-wire-validation'
import { ensureSpoolControlSubscription } from './spool-control-subscription'
import {
  createSpoolDesktopRecord,
  projectSpoolRemoteDesktop,
  spoolDesktopHasWorktree,
  type SpoolDesktopRecord
} from './spool-desktop-record'
import {
  bindSpoolRequesterConnection,
  invokeSpoolRequesterConnection,
  subscribeSpoolRequesterConnection,
  type SpoolRequesterSubscriptionSink
} from './spool-desktop-requester-transport'
import { SpoolPeerConnection } from './spool-peer-connection'
import type { SpoolSubscription } from './spool-peer-connection-contract'
import type { SpoolProbeClient } from './spool-probe-client'
import type { DiscoveredSpoolDesktop, TailnetPeerDirectory } from './tailnet-peer-directory'

const RECONNECT_DELAY_MS = 2_000

export type SpoolDesktopCatalogSnapshot = {
  desktops: readonly SpoolRemoteDesktop[]
  controlStates: readonly SpoolRequesterControlView[]
}

export type { SpoolRequesterSubscriptionSink } from './spool-desktop-requester-transport'

export class SpoolDesktopCatalog {
  private readonly records = new Map<string, SpoolDesktopRecord>()
  private readonly listeners = new Set<(snapshot: SpoolDesktopCatalogSnapshot) => void>()
  private unsubscribeDirectory: (() => void) | null = null
  private started = false

  constructor(
    private readonly directory: TailnetPeerDirectory,
    private readonly probeClient: SpoolProbeClient
  ) {}

  snapshot(): SpoolDesktopCatalogSnapshot {
    const desktops = [...this.records.values()].map(projectSpoolRemoteDesktop)
    const controlStates = [...this.records.values()].flatMap((record) => [
      ...record.controlStates.values()
    ])
    return { desktops, controlStates }
  }

  subscribe(listener: (snapshot: SpoolDesktopCatalogSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    this.unsubscribeDirectory = this.directory.subscribe((desktops) =>
      this.reconcileDirectory(desktops)
    )
    this.directory.start()
  }

  stop(): void {
    this.started = false
    this.unsubscribeDirectory?.()
    this.unsubscribeDirectory = null
    this.directory.stop()
    for (const record of this.records.values()) {
      this.disposeConnection(record)
    }
    this.records.clear()
    this.emit()
  }

  async requestControl(desktopRef: string, worktreeRef: string): Promise<void> {
    const record = this.records.get(desktopRef)
    if (
      !record?.connection ||
      record.status !== 'connected' ||
      !spoolDesktopHasWorktree(record, worktreeRef)
    ) {
      throw new Error('resource_unavailable')
    }
    ensureSpoolControlSubscription(record, worktreeRef, () => this.emit())
    await record.connection.request('control.request', { worktreeRef }, { mutation: true })
  }

  async invokeRequester(args: SpoolRequesterInvokeArgs): Promise<unknown> {
    return await invokeSpoolRequesterConnection(
      args,
      bindSpoolRequesterConnection(this.records, args)
    )
  }

  subscribeRequester(
    args: SpoolRequesterSubscriptionArgs,
    sink: SpoolRequesterSubscriptionSink
  ): SpoolSubscription {
    return subscribeSpoolRequesterConnection(
      args,
      bindSpoolRequesterConnection(this.records, args),
      sink
    )
  }

  private reconcileDirectory(desktops: readonly DiscoveredSpoolDesktop[]): void {
    const desired = new Set(desktops.map((desktop) => desktop.desktopRef))
    for (const descriptor of desktops) {
      const existing = this.records.get(descriptor.desktopRef)
      if (existing) {
        existing.descriptor = descriptor
      } else {
        const record = createSpoolDesktopRecord(descriptor)
        this.records.set(descriptor.desktopRef, record)
        void this.connect(record)
      }
    }
    for (const [desktopRef, record] of this.records) {
      if (!desired.has(desktopRef)) {
        this.disposeConnection(record)
        this.records.delete(desktopRef)
      }
    }
    this.emit()
  }

  private async connect(record: SpoolDesktopRecord): Promise<void> {
    if (!this.started || record.connection) {
      return
    }
    record.connectionGeneration++
    const generation = record.connectionGeneration
    record.connectionEpoch++
    record.status = 'connecting'
    this.emit()
    try {
      const admission = await this.probeClient.probe(record.descriptor.address)
      if (!this.started || generation !== record.connectionGeneration) {
        return
      }
      if (
        admission.response.ownerRuntimeId !== record.descriptor.ownerRuntimeId ||
        admission.response.ownerKeyFingerprint !== record.descriptor.ownerKeyFingerprint
      ) {
        throw new Error('spool_owner_identity_changed')
      }
      const connection = new SpoolPeerConnection(admission)
      record.connection = connection
      record.unsubscribeState = connection.subscribeState((state) => {
        if (state.status === 'disconnected') {
          this.handleConnectionLoss(record, connection)
        }
      })
      await connection.connect()
      if (record.connection !== connection) {
        connection.close()
        return
      }
      record.status = 'connected'
      this.openCatalogSubscription(record, connection)
      this.emit()
    } catch {
      if (generation === record.connectionGeneration) {
        this.handleConnectionLoss(record, record.connection)
      }
    }
  }

  private openCatalogSubscription(
    record: SpoolDesktopRecord,
    connection: SpoolPeerConnection
  ): void {
    const subscription = connection.subscribe<unknown>(
      'catalog.subscribe',
      {},
      {
        next: (value) => {
          if (!isSpoolDesktopCatalog(value, record.descriptor.ownerRuntimeId)) {
            throw new Error('invalid_spool_catalog')
          }
          this.loadCatalogSessions(record, connection, value)
        },
        error: () => this.handleCatalogSubscriptionLoss(record, connection),
        complete: () => this.handleCatalogSubscriptionLoss(record, connection)
      }
    )
    if (record.connection === connection && record.status === 'connected') {
      record.catalogSubscription = subscription
    } else {
      subscription.close()
    }
  }

  private loadCatalogSessions(
    record: SpoolDesktopRecord,
    connection: SpoolPeerConnection,
    catalog: NonNullable<SpoolDesktopRecord['catalog']>
  ): void {
    reconcileSpoolCatalogSessionLoad({
      record,
      connection,
      catalog,
      isConnected: () =>
        this.records.get(record.descriptor.desktopRef) === record &&
        record.connection === connection &&
        record.status === 'connected',
      onCatalogChanged: () => {
        this.pruneControlSubscriptions(record)
        this.emit()
      }
    })
  }

  private handleCatalogSubscriptionLoss(
    record: SpoolDesktopRecord,
    connection: SpoolPeerConnection
  ): void {
    if (record.connection === connection && record.status === 'connected') {
      // Why: a lost catalog stream cannot leave stale Public metadata visible.
      this.handleConnectionLoss(record, connection)
    }
  }

  private pruneControlSubscriptions(record: SpoolDesktopRecord): void {
    const worktreeRefs = new Set(
      record.catalog?.projects.flatMap((project) =>
        project.worktrees.map((worktree) => worktree.worktreeRef)
      ) ?? []
    )
    for (const [worktreeRef, subscription] of record.controlSubscriptions) {
      if (!worktreeRefs.has(worktreeRef)) {
        subscription.close()
        record.controlSubscriptions.delete(worktreeRef)
        record.controlStates.delete(worktreeRef)
      }
    }
  }

  private handleConnectionLoss(
    record: SpoolDesktopRecord,
    connection: SpoolPeerConnection | null
  ): void {
    if (connection && record.connection !== connection) {
      return
    }
    this.disposeConnection(record)
    record.connectionEpoch++
    record.status = 'disconnected'
    record.catalog = null
    record.controlStates.clear()
    this.emit()
    if (this.started && this.records.has(record.descriptor.desktopRef)) {
      record.reconnectTimer = setTimeout(() => {
        record.reconnectTimer = null
        void this.connect(record)
      }, RECONNECT_DELAY_MS)
    }
  }

  private disposeConnection(record: SpoolDesktopRecord): void {
    record.connectionGeneration++
    cancelSpoolCatalogSessionLoad(record)
    if (record.reconnectTimer) {
      clearTimeout(record.reconnectTimer)
      record.reconnectTimer = null
    }
    record.unsubscribeState?.()
    record.unsubscribeState = null
    const connection = record.connection
    record.connection = null
    record.catalogSubscription?.close()
    record.catalogSubscription = null
    for (const subscription of record.controlSubscriptions.values()) {
      subscription.close()
    }
    record.controlSubscriptions.clear()
    for (const subscription of record.requesterSubscriptions) {
      subscription.close()
    }
    record.requesterSubscriptions.clear()
    connection?.close()
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}
