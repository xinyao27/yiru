import { createServer, type IncomingMessage, type Server } from 'node:http'
import { isIP } from 'node:net'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type { SpoolE2EEKeypair } from './spool-e2ee-keypair'
import type { SpoolProbeService } from './spool-ingress-probe'
import type { SpoolRpcGateway } from './spool-rpc-gateway'
import type { SpoolTicketAuthority } from './spool-ticket-authority'
import type { TailnetControl, TailnetPrincipal, TailnetSnapshot } from './tailnet-control'
import { openSpoolEncryptedConnection } from './spool-ingress-encrypted-connection'
import { normalizeTailnetIp } from './tailscale-json-projection'
import {
  SPOOL_CONNECT_PATH,
  SPOOL_INGRESS_PORT,
  SPOOL_MAX_ENCRYPTED_FRAME_BYTES,
  SPOOL_PROBE_PATH
} from '../../shared/spool/spool-wire-contract'

const RECONCILE_INTERVAL_MS = 5_000
const MAX_SPOOL_CONNECTIONS = 128
const MAX_SPOOL_CONNECTIONS_PER_NODE = 8

type SpoolListener = {
  server: Server
  sockets: Set<WebSocket>
}

export type SpoolIngressOptions = {
  tailnet: TailnetControl
  probe: SpoolProbeService
  tickets: SpoolTicketAuthority
  keypair: SpoolE2EEKeypair
  gateway: SpoolRpcGateway
  ownerRuntimeId: string
  ownerKeyFingerprint: string
  onUnavailable?: (error: Error) => void
}

export class SpoolIngress {
  private readonly listeners = new Map<string, SpoolListener>()
  private readonly webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: SPOOL_MAX_ENCRYPTED_FRAME_BYTES,
    perMessageDeflate: false
  })
  private readonly connectionCountByNode = new Map<string, number>()
  private readonly connectionCleanups = new Map<WebSocket, () => void>()
  private reconcileTimer: ReturnType<typeof setInterval> | null = null
  private started = false
  private pendingUpgrades = 0

  constructor(private readonly options: SpoolIngressOptions) {}

  async start(): Promise<void> {
    if (this.started) {
      return
    }
    const snapshot = await this.options.tailnet.readSnapshot()
    this.started = true
    try {
      await this.reconcile(snapshot.self.addresses)
      this.reconcileTimer = setInterval(
        () => void this.reconcileFromTailnet(),
        RECONCILE_INTERVAL_MS
      )
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    this.started = false
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
    this.options.tickets.clear()
    for (const listener of this.listeners.values()) {
      for (const socket of listener.sockets) {
        this.connectionCleanups.get(socket)?.()
        socket.terminate()
      }
    }
    const closePromises = [...this.listeners.values()].map(
      (listener) =>
        new Promise<void>((resolve) => {
          listener.server.close(() => resolve())
          listener.server.closeAllConnections()
        })
    )
    this.listeners.clear()
    await Promise.allSettled(closePromises)
  }

  private async reconcileFromTailnet(): Promise<void> {
    if (!this.started) {
      return
    }
    let snapshot: TailnetSnapshot
    try {
      snapshot = await this.options.tailnet.readSnapshot()
    } catch {
      // Why: a CLI timeout or tailscaled restart must not revoke a still-live
      // physical socket; the next interval retries address reconciliation.
      return
    }
    try {
      await this.reconcile(snapshot.self.addresses)
    } catch (error) {
      const cause =
        error instanceof Error ? error : new Error('Spool Tailnet reconciliation failed')
      await this.stop()
      this.options.onUnavailable?.(cause)
    }
  }

  private async reconcile(addresses: readonly string[]): Promise<void> {
    const desired = new Set(
      addresses.map(normalizeTailnetIp).filter((address): address is string => address !== null)
    )
    for (const address of desired) {
      if (!this.listeners.has(address)) {
        this.listeners.set(address, await this.openListener(address))
      }
    }
    for (const [address, listener] of this.listeners) {
      if (!desired.has(address)) {
        this.listeners.delete(address)
        for (const socket of listener.sockets) {
          this.connectionCleanups.get(socket)?.()
          socket.terminate()
        }
        await new Promise<void>((resolve) => listener.server.close(() => resolve()))
      }
    }
  }

  private async openListener(address: string): Promise<SpoolListener> {
    const sockets = new Set<WebSocket>()
    const server = createServer((request, response) => {
      const pathname = parsePathname(request.url)
      if (request.method === 'POST' && pathname === SPOOL_PROBE_PATH) {
        void this.options.probe.handle(request, response)
        return
      }
      response.writeHead(404, { 'Cache-Control': 'no-store' })
      response.end()
    })
    server.requestTimeout = 5_000
    server.headersTimeout = 5_000
    server.keepAliveTimeout = 1_000
    server.on('upgrade', (request, socket, head) => {
      void this.handleUpgrade(address, sockets, request, socket, head)
    })
    await listenOnTailnetAddress(server, address)
    return { server, sockets }
  }

  private async handleUpgrade(
    listenerAddress: string,
    sockets: Set<WebSocket>,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): Promise<void> {
    if (
      !this.started ||
      parsePathname(request.url) !== SPOOL_CONNECT_PATH ||
      request.headers.origin ||
      hasForwardedAddressHeader(request) ||
      this.webSockets.clients.size + this.pendingUpgrades >= MAX_SPOOL_CONNECTIONS
    ) {
      rejectUpgrade(socket, 403)
      return
    }
    const sourceAddress = normalizeTailnetIp(request.socket.remoteAddress ?? '')
    if (!sourceAddress) {
      rejectUpgrade(socket, 403)
      return
    }
    this.pendingUpgrades++
    try {
      const principal = await this.options.tailnet.identifySource({
        host: sourceAddress,
        port: request.socket.remotePort ?? null
      })
      if (
        !this.started ||
        !principal ||
        (this.connectionCountByNode.get(principal.nodeId) ?? 0) >= MAX_SPOOL_CONNECTIONS_PER_NODE
      ) {
        rejectUpgrade(socket, 403)
        return
      }
      this.webSockets.handleUpgrade(request, socket, head, (webSocket) => {
        sockets.add(webSocket)
        this.connectionCountByNode.set(
          principal.nodeId,
          (this.connectionCountByNode.get(principal.nodeId) ?? 0) + 1
        )
        this.openEncryptedConnection(listenerAddress, webSocket, principal)
      })
    } catch {
      rejectUpgrade(socket, 503)
    } finally {
      this.pendingUpgrades--
    }
  }

  private openEncryptedConnection(
    listenerAddress: string,
    webSocket: WebSocket,
    requester: TailnetPrincipal
  ): void {
    const cleanup = openSpoolEncryptedConnection({
      webSocket,
      requester,
      tickets: this.options.tickets,
      keypair: this.options.keypair,
      gateway: this.options.gateway,
      ownerRuntimeId: this.options.ownerRuntimeId,
      ownerKeyFingerprint: this.options.ownerKeyFingerprint,
      onClosed: () => {
        this.connectionCleanups.delete(webSocket)
        this.listeners.get(listenerAddress)?.sockets.delete(webSocket)
        decrementNodeCount(this.connectionCountByNode, requester.nodeId)
      }
    })
    this.connectionCleanups.set(webSocket, cleanup)
  }
}

function listenOnTailnetAddress(server: Server, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once('error', onError)
    server.listen(
      { host: address, port: SPOOL_INGRESS_PORT, ipv6Only: isIP(address) === 6 },
      () => {
        server.off('error', onError)
        resolve()
      }
    )
  })
}

function parsePathname(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://spool.invalid').pathname
  } catch {
    return '/'
  }
}

function hasForwardedAddressHeader(request: IncomingMessage): boolean {
  return Boolean(
    request.headers.forwarded || request.headers['x-forwarded-for'] || request.headers['x-real-ip']
  )
}

function rejectUpgrade(socket: Duplex, status: 403 | 503): void {
  if (!socket.destroyed) {
    socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }
}

function decrementNodeCount(counts: Map<string, number>, nodeId: string): void {
  const next = (counts.get(nodeId) ?? 1) - 1
  if (next <= 0) {
    counts.delete(nodeId)
  } else {
    counts.set(nodeId, next)
  }
}
