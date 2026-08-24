import type { RuntimeTransportMetadata } from '~shared/runtime-bootstrap'

import { DeviceRegistry } from './device-registry'
import { loadOrCreateE2EEKeypair } from './e2ee-keypair'
import { RuntimeRpcMessageServer } from './rpc-message-server'
import { sweepOrphanedRuntimeSockets } from './rpc-socket-sweep'
import { MobileSocketWiring } from './rpc/mobile-socket-wiring'
import { runtimeOrpcRouter } from './rpc/orpc/router'
import { RuntimeOrpcSocketHandler } from './rpc/orpc/socket-handler'
import { RuntimeOrpcWsHandler } from './rpc/orpc/ws-handler'
import type { RpcTransport } from './rpc/transport'
import { createRuntimeTransportMetadata } from './rpc/transport-metadata'
import { UnixSocketTransport } from './rpc/unix-socket-transport'
import { readWsFallbackPort, writeWsFallbackPort } from './rpc/ws-fallback-port-store'
import { WebSocketTransport } from './rpc/ws-transport'

export class YiruRuntimeRpcServer extends RuntimeRpcMessageServer {
  async start(): Promise<void> {
    if (this.activeTransports.length > 0) {
      return
    }

    // Why: processes killed by SIGKILL / OOM-kill / forced-shutdown skip
    // stop() and leave behind `o-<pid>-*.sock` files in userData. Sweeping
    // dead-pid sockets at startup keeps the directory from accumulating
    // orphans over the app's lifetime. Named-pipe transports on Windows do
    // not leave filesystem entries in userData, so the sweep is a no-op
    // there.
    if (this.platform !== 'win32') {
      sweepOrphanedRuntimeSockets(this.userDataPath, this.pid)
    }

    await this.runtimeLoopback.start()
    const transportMeta = createRuntimeTransportMetadata(
      this.userDataPath,
      this.pid,
      this.platform,
      this.runtime.getRuntimeId()
    )

    const socketTransport = new UnixSocketTransport({
      endpoint: transportMeta.endpoint,
      kind: transportMeta.kind as 'unix' | 'named-pipe'
    })
    const runtimeOrpcSocketHandler = new RuntimeOrpcSocketHandler({
      runtime: this.runtime,
      authToken: this.authToken,
      mobileDevelopmentPairing: (params) => this.createDevelopmentMobilePairing(params),
      openTerminalMultiplex: (input) => {
        const endpoint = this.runtimeLoopback.endpoint
        if (!endpoint) {
          throw new Error('terminal_loopback_unavailable')
        }
        return this.terminalMultiplex.issueTicket(
          'loopback-renderer',
          input.clientInstanceId,
          input.environmentId,
          endpoint
        )
      },
      beforeInvocation: (invocation, connection) =>
        this.beforeRuntimeOrpcSocketInvocation(invocation, connection)
    })
    socketTransport.onProtocol(runtimeOrpcSocketHandler)

    // Why: Unix socket transport uses the shared runtime auth token. This is
    // the existing security model for CLI connections — the token lives in a
    // 0o600-permissioned file on disk.
    // Why: the `.catch` guarantees `reply()` always fires even if
    // `handleMessage` (or `JSON.stringify` on a pathological response) throws.
    // Without it, a throw would leave the client waiting for a terminal frame
    // that never arrives AND leak the dispatch's AbortController in the
    // transport's in-flight set until the 30 s socket idle timer closes the
    // connection.
    socketTransport.onMessage((msg, reply, context) => {
      void this.handleMessage(msg, context)
        .then((response) => {
          reply(JSON.stringify(response))
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          // Why: best-effort id recovery so the client can correlate the
          // error frame to its pending request. A malformed message would
          // have been caught by handleMessage and returned an envelope
          // instead of throwing, so in practice the id is always present.
          let id = 'unknown'
          try {
            const parsed = JSON.parse(msg) as { id?: unknown }
            if (typeof parsed.id === 'string' && parsed.id.length > 0) {
              id = parsed.id
            }
          } catch {
            // ignore — fall through with id='unknown'
          }
          reply(JSON.stringify(this.buildError(id, 'internal_error', message)))
        })
    })

    try {
      await socketTransport.start()
    } catch (error) {
      await this.runtimeLoopback.stop().catch(() => {})
      throw error
    }

    const activeTransports: RpcTransport[] = [socketTransport, this.runtimeLoopback]
    const transportsMeta: RuntimeTransportMetadata[] = [transportMeta]

    // Why: WebSocket transport is opt-in and starts alongside the Unix socket.
    // It uses per-device tokens and E2EE (application-layer encryption via
    // tweetnacl) rather than TLS, since React Native can't pin self-signed certs.
    if (this.enableWebSocket) {
      try {
        this.deviceRegistry = new DeviceRegistry(this.userDataPath)
        this.e2eeKeypair = loadOrCreateE2EEKeypair(this.userDataPath)

        const wsTransport = new WebSocketTransport({
          host: '0.0.0.0',
          port: this.wsPort,
          staticRoot: this.webClientRoot,
          // Why: keep the fallback port stable across restarts so paired
          // devices' stored endpoints stay valid (STA-1511) — the transport
          // binds a persisted fallback before the preferred port unless the
          // caller explicitly pinned a port (serve --port). Port 0 requests an
          // ephemeral port for an isolated temporary runtime, so don't pin it.
          ...(this.wsPort !== 0 ? { fallbackPort: readWsFallbackPort(this.userDataPath) } : {}),
          ...(this.preferPinnedWsPort ? { preferPinnedPort: true } : {})
        })
        const runtimeOrpcWsHandler = new RuntimeOrpcWsHandler({
          runtime: this.runtime,
          router: runtimeOrpcRouter,
          resolveAdmission: (socket) => this.resolveRuntimeOrpcAdmission(socket),
          beforeInvocation: (socket, invocation) =>
            this.beforeRuntimeOrpcInvocation(socket, invocation),
          registerBinaryStreamHandler: (connectionId, streamId, handler) =>
            this.registerBinaryStreamHandler(connectionId, streamId, handler),
          openTerminalMultiplex: (socket, input) =>
            this.terminalMultiplex.issueTicket(
              socket.device.deviceId,
              input.clientInstanceId,
              input.environmentId,
              wsTransport.getConnectionEndpoint(socket.ws)
            ),
          activateTerminalMultiplexEpoch: (socket) =>
            this.terminalMultiplex.activateEpoch(socket.connectionId, (code, reason) =>
              socket.ws.close(code, reason)
            )
        })
        const mobileSocketWiring = new MobileSocketWiring({
          deviceRegistry: this.deviceRegistry,
          e2eeKeypair: this.e2eeKeypair,
          getRuntimeId: () => this.runtime.getRuntimeId(),
          onText: (socket, plaintext, reply, sendBinary) => {
            if (runtimeOrpcWsHandler.handleText(socket, plaintext)) {
              return
            }
            void this.handleWebSocketMessage(
              plaintext,
              reply,
              sendBinary,
              undefined,
              socket.ws,
              socket.device.deviceToken
            )
          },
          onBinary: (socket, bytes) => {
            if (!runtimeOrpcWsHandler.handleBinary(socket, bytes)) {
              this.handleWebSocketBinaryMessage(bytes, socket.ws)
            }
          },
          onClose: (socket, hasOtherConnections) => {
            if (!socket) {
              return
            }
            runtimeOrpcWsHandler.close(socket)
            this.abortWebSocketDispatches(socket.ws)
            // Why: subscriptions and binary streams are socket-scoped, while
            // client disconnect state is device-scoped across both transports.
            this.runtime.cleanupSubscriptionsForConnection(socket.connectionId)
            this.terminalMultiplex.closeConnection(socket.connectionId)
            if (!hasOtherConnections) {
              this.runtime.onClientDisconnected(socket.device.deviceToken)
            }
          }
        })
        mobileSocketWiring.attachTransport(wsTransport)
        this.mobileSocketWiring = mobileSocketWiring

        await wsTransport.start()
        if (this.wsPort !== 0 && wsTransport.resolvedPort !== this.wsPort) {
          writeWsFallbackPort(this.userDataPath, wsTransport.resolvedPort)
        }
        activeTransports.push(wsTransport)
        transportsMeta.push({
          kind: 'websocket',
          endpoint: `ws://0.0.0.0:${wsTransport.resolvedPort}`
        })
      } catch (error) {
        // Why: WebSocket transport is supplementary — the runtime must still
        // function if it fails to start (e.g., port in use). Log and continue
        // with Unix socket only.
        console.error('[runtime] Failed to start WebSocket transport:', error)
        this.mobileSocketWiring = null
      }
    }

    // Why: publish the transport into in-memory state before writing metadata
    // so the bootstrap file always contains the real endpoint/token pair. The
    // CLI only discovers the runtime through that file.
    this.activeTransports = activeTransports
    this.transports = transportsMeta

    try {
      this.writeMetadata()
    } catch (error) {
      // Why: a runtime that cannot publish bootstrap metadata is invisible to
      // the `yiru` CLI. Close all transports immediately instead of leaving
      // behind a live but undiscoverable control plane.
      this.activeTransports = []
      this.transports = []
      await Promise.all(activeTransports.map((t) => t.stop().catch(() => {}))).catch(() => {})
      throw error
    }
  }

  async stop(): Promise<void> {
    const transports = this.activeTransports
    this.activeTransports = []
    this.transports = []
    this.mobileSocketWiring = null
    if (transports.length === 0) {
      return
    }
    await Promise.all(transports.map((t) => t.stop()))
    // Why: we intentionally leave the last metadata file behind instead of
    // deleting it on shutdown. Shared userData paths can briefly host multiple
    // Yiru processes during restarts, updates, or development, and stale
    // metadata is safer than letting one process erase another live runtime's
    // bootstrap file.
  }

  // Why: Unix socket messages use one-shot dispatch (single response per
  // request) and the shared runtime auth token from the 0o600 metadata file.
  // The transport layer owns socket lifecycle, keepalive writes, and the
  // per-connection abort signal — this method just parses, auths, and
  // dispatches. See design doc §3.1.
}
