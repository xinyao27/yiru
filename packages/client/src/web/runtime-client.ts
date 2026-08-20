import { RUNTIME_ORPC_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
/* eslint-disable max-lines -- Why: this browser runtime client owns the E2EE
   WebSocket state machine, JSON-RPC request routing, streaming callbacks, and
   binary frame forwarding as one transport boundary. */
import type { RuntimeRpcResponse, RuntimeRpcSuccess } from '@yiru/runtime-protocol/rpc-envelope'
import { isKeepaliveFrame } from '@yiru/runtime-protocol/rpc-envelope'
import { withRemoteRuntimeTailscaleHint } from '@yiru/runtime-protocol/tailscale-endpoint'
import type { MachineBrowserReady } from '@yiru/runtime-protocol/web-connect'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '~shared/runtime-method-contract'
import { RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY } from '~shared/runtime-orpc-socket'

import {
  createBrowserRelaySession,
  readMachineBrowserReady,
  verifyMachineBrowserReady,
  type BrowserRelaySession
} from './connect/grant-client'
import {
  bytesFromBase64,
  decrypt,
  decryptBytes,
  deriveSharedKey,
  encrypt,
  encryptBytes,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from './e2ee'
import {
  createLegacyRuntimeHeartbeatRequest,
  createLegacyRuntimeOrpcClient,
  LEGACY_RUNTIME_STREAM_METHODS
} from './legacy-orpc-link'
import {
  createWebRuntimeOrpcConnection,
  type WebRuntimeOrpcClient,
  type WebRuntimeOrpcConnection
} from './orpc-channel'
import type { WebPairingOffer } from './pairing'
import { WebShellServicesChannel } from './shell-services-channel'
import {
  openWebTerminalMultiplexSubscription,
  type WebTerminalMultiplexSubscription
} from './terminal-multiplex-subscription'

type WebRuntimeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'auth-failed'

type PendingRequest = {
  method: string
  resolve: (response: RuntimeRpcResponse<unknown>) => void
  reject: (error: Error) => void
  timeout: number
  removeAbortListener: () => void
}

type SubscriptionCallbacks = {
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
  onError?: (error: { code: string; message: string }) => void
  onClose?: () => void
  onTransportInterrupted?: () => void
  onTransportReplayed?: () => void
}

type RuntimeSubscription = {
  id: string
  method: string
  params: unknown
  callbacks: SubscriptionCallbacks
  needsReplay: boolean
}

export type WebRuntimeSubscriptionHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}

export type SubscribeOptions = {
  timeoutMs?: number
  // Why: streaming subscriptions whose server-side cleanup is keyed by a
  // client-supplied token (native chat keys its fs-watcher by agent:sessionId)
  // must send an explicit unsubscribe RPC on teardown so the watcher is reaped
  // on view-toggle, not just on socket close. Returns the RPC frame to emit, or
  // null when the method needs no explicit teardown.
  buildUnsubscribe?: (params: unknown) => { method: string; params: unknown } | null
}

type WebRuntimeClientOptions = {
  enableShellServices?: boolean
}

type PreparedRelayConnection = {
  session: BrowserRelaySession
  secretKey: Uint8Array
}

const REQUEST_TIMEOUT_MS = 30_000
const CONNECT_TIMEOUT_MS = 12_000
const HANDSHAKE_TIMEOUT_MS = 10_000
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15_000]
const SHARED_CONNECTION_SUBSCRIPTION_METHODS = new Set([LEGACY_RUNTIME_STREAM_METHODS.filesWatch])
// Why: the browser WebSocket API hides protocol pings/pongs, so a half-open
// connection (mobile NAT idle timeout, server crash, wifi→cellular handoff)
// leaves readyState===OPEN with no onclose/onerror — the UI silently freezes on
// stale data and never reconnects. Poll connection liveness while the tab is
// visible: after HEARTBEAT_IDLE_MS of silence send a cheap status.get probe
// (any inbound frame proves liveness), and only if that probe stays unanswered
// for HEARTBEAT_PROBE_GRACE_MS close the socket to drive the reconnect path.
// Closing is gated on an unanswered PROBE, never on raw accumulated silence, so
// a backgrounded/frozen tab can never be mistaken for a dead socket on resume.
const HEARTBEAT_INTERVAL_MS = 10_000
const HEARTBEAT_IDLE_MS = 25_000
const HEARTBEAT_PROBE_GRACE_MS = 20_000

export class WebRuntimeClient {
  private ws: WebSocket | null = null
  private sharedKey: Uint8Array | null = null
  private state: WebRuntimeConnectionState = 'disconnected'
  private requestCounter = 0
  private reconnectAttempt = 0
  private intentionallyClosed = false
  private connectTimer: number | null = null
  private handshakeTimer: number | null = null
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private lastInboundFrameAt = 0
  // Why: timestamp of an outstanding liveness probe (null = none in flight).
  // The dead-close fires only when a SENT probe goes unanswered, never on raw
  // silence, so a hidden/frozen tab resuming after a long gap re-probes first.
  private heartbeatProbeSentAt: number | null = null
  // Why: detect a suspended tick loop (backgrounded/frozen tab). If a tick lands
  // far later than scheduled, treat the gap as "no evidence", reset the clocks,
  // and re-probe instead of closing.
  private lastHeartbeatTickAt = 0
  private readonly pending = new Map<string, PendingRequest>()
  private readonly subscriptions = new Map<string, RuntimeSubscription>()
  private readonly fileWatchTeardownRetries = new Map<string, Set<() => Promise<void>>>()
  private readonly childClients = new Set<WebRuntimeClient>()
  private readonly waiters: { resolve: () => void; reject: (error: Error) => void }[] = []
  private readonly serverPublicKey: Uint8Array | null
  private relayDeviceToken: string | null = null
  private preparedRelay: PreparedRelayConnection | null = null
  private orpcConnection: WebRuntimeOrpcConnection | null = null
  private legacyOrpcClient: WebRuntimeOrpcClient | null = null
  private orpcClientPromise: Promise<WebRuntimeOrpcClient> | null = null
  private orpcTransport: 'unknown' | 'legacy' | 'peer' = 'unknown'
  private shellServicesChannel: WebShellServicesChannel | null = null
  private terminalMultiplexSubscription: WebTerminalMultiplexSubscription | null = null
  private authenticatedRuntimeId: string | null = null
  private readonly authenticatedCapabilities = new Set<string>()
  private readonly pairing: WebPairingOffer
  private readonly onRuntimeId: (runtimeId: string) => void
  private readonly options: WebRuntimeClientOptions

  constructor(
    pairing: WebPairingOffer,
    onRuntimeId: (runtimeId: string) => void = () => {},
    options: WebRuntimeClientOptions = {}
  ) {
    this.pairing = pairing
    this.onRuntimeId = onRuntimeId
    this.options = options
    this.serverPublicKey = pairing.relayMachineId ? null : publicKeyFromBase64(pairing.publicKeyB64)
    this.openConnection()
  }

  call<TContract extends RuntimeMethodContract>(
    contract: TContract,
    params: RuntimeMethodParams<TContract>,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<RuntimeRpcResponse<RuntimeMethodResult<TContract>>>
  call(
    contract: string,
    params?: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<RuntimeRpcResponse<unknown>>
  async call(
    contract: string | RuntimeMethodContract,
    params?: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<RuntimeRpcResponse<unknown>> {
    const method = typeof contract === 'string' ? contract : contract.name
    await this.waitForConnected(options?.timeoutMs, options?.signal)
    return new Promise((resolve, reject) => {
      const id = this.nextId()
      const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
      const timeout = window.setTimeout(() => {
        this.pending.delete(id)
        removeAbortListener()
        reject(new Error(`Request timed out: ${method}`))
      }, timeoutMs)
      const abort = (): void => {
        this.pending.delete(id)
        window.clearTimeout(timeout)
        removeAbortListener()
        reject(abortError(options?.signal))
      }
      const removeAbortListener = (): void => options?.signal?.removeEventListener('abort', abort)
      if (options?.signal?.aborted) {
        window.clearTimeout(timeout)
        reject(abortError(options.signal))
        return
      }
      options?.signal?.addEventListener('abort', abort, { once: true })
      this.pending.set(id, { method, resolve, reject, timeout, removeAbortListener })
      if (!this.sendEncrypted({ id, deviceToken: this.pairing.deviceToken, method, params })) {
        this.pending.delete(id)
        window.clearTimeout(timeout)
        removeAbortListener()
        reject(new Error('Runtime host is not connected.'))
      }
    })
  }

  async getOrpcClient(
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient> {
    await this.waitForConnected(timeoutMs, signal)
    if (this.orpcTransport === 'peer') {
      return this.getPeerOrpcClient()
    }
    if (this.orpcTransport === 'legacy') {
      return this.getLegacyOrpcClient()
    }
    if (!this.orpcClientPromise) {
      // Why: a runtime-scoped pairing is issued by the pure Node host, whose
      // WebSocket surface is oRPC-only. Probing it with the legacy JSON envelope
      // is an invalid frame, so authenticate its identity with typed status.get.
      this.orpcClientPromise =
        this.pairing.scope === 'runtime'
          ? this.connectRuntimeOrpcClient(timeoutMs, signal)
          : this.negotiateOrpcClient(timeoutMs, signal)
    }
    const pendingClient = this.orpcClientPromise
    try {
      return await pendingClient
    } finally {
      if (this.orpcClientPromise === pendingClient) {
        this.orpcClientPromise = null
      }
    }
  }

  async subscribe(
    method: string,
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: SubscribeOptions
  ): Promise<WebRuntimeSubscriptionHandle> {
    if (SHARED_CONNECTION_SUBSCRIPTION_METHODS.has(method)) {
      // Why: file watches are text-only and already have an explicit
      // files.unwatch RPC, so sharing the main socket avoids exhausting the
      // server's WebSocket connection cap in large browser sessions.
      return this.subscribeSharedFileWatch(params, callbacks, options)
    }
    const client = new WebRuntimeClient(this.pairing, this.onRuntimeId, {
      enableShellServices: method === 'terminal.multiplex' ? false : undefined
    })
    this.childClients.add(client)
    const closeChild = (notifySubscriptions = false): void => {
      this.childClients.delete(client)
      client.close({ notifySubscriptions })
    }
    try {
      const wrappedCallbacks: SubscriptionCallbacks = {
        ...callbacks,
        onError: (error) => {
          callbacks.onError?.(error)
          closeChild()
        },
        onClose: () => {
          callbacks.onClose?.()
          closeChild()
        }
      }
      const handle = await client.subscribeOnCurrentConnection(
        method,
        params,
        wrappedCallbacks,
        options
      )
      return {
        unsubscribe: () => {
          // Why: emit the explicit teardown RPC (e.g. nativeChat.unsubscribe)
          // on the child socket BEFORE closing it, so the server reaps the
          // fs-watcher on view-toggle instead of leaking it until socket close.
          handle.unsubscribe()
          closeChild()
        },
        sendBinary: (bytes) => handle.sendBinary(bytes)
      }
    } catch (error) {
      closeChild()
      throw error
    }
  }

  private async subscribeSharedFileWatch(
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: { timeoutMs?: number }
  ): Promise<WebRuntimeSubscriptionHandle> {
    const teardownKey = JSON.stringify(params) ?? String(params)
    await Promise.all(
      Array.from(this.fileWatchTeardownRetries.get(teardownKey) ?? [], (retry) => retry())
    )
    let stopped = false
    let remoteSubscriptionId: string | null = null
    let transportInterrupted = false
    let pendingReplayResync = false
    let unwatchStarted = false
    let handle: WebRuntimeSubscriptionHandle | null = null
    const dropLocalSubscription = (): void => {
      handle?.unsubscribe()
    }
    let unwatchAttempt: Promise<void> | null = null
    const retryRemoteUnwatch = (): Promise<void> => {
      if (unwatchAttempt) {
        return unwatchAttempt
      }
      unwatchStarted = true
      const attempt = this.call(
        LEGACY_RUNTIME_STREAM_METHODS.filesUnwatch,
        { subscriptionId: remoteSubscriptionId! },
        { timeoutMs: 5_000 }
      )
        .then((response) => {
          if (response.ok === false) {
            throw new Error(`${response.error.code}: ${response.error.message}`)
          }
          const retries = this.fileWatchTeardownRetries.get(teardownKey)
          retries?.delete(retryRemoteUnwatch)
          if (retries?.size === 0) {
            this.fileWatchTeardownRetries.delete(teardownKey)
          }
          dropLocalSubscription()
        })
        .catch((error: unknown) => {
          console.warn('Failed to unwatch remote file subscription:', error)
          throw error
        })
        .finally(() => {
          unwatchAttempt = null
          unwatchStarted = false
        })
      unwatchAttempt = attempt
      return attempt
    }
    const unwatchAndDropLocalSubscription = (): void => {
      if (unwatchStarted) {
        return
      }
      if (!remoteSubscriptionId) {
        dropLocalSubscription()
        return
      }
      // Why: retain the shared-socket callback and retry ownership until the
      // server acknowledges physical teardown; a new watch joins this barrier.
      const retries = this.fileWatchTeardownRetries.get(teardownKey) ?? new Set()
      retries.add(retryRemoteUnwatch)
      this.fileWatchTeardownRetries.set(teardownKey, retries)
      void retryRemoteUnwatch().catch(() => {})
    }
    const wrappedCallbacks: SubscriptionCallbacks = {
      ...callbacks,
      onResponse: (response) => {
        transportInterrupted = false
        const nextSubscriptionId = getFileWatchSubscriptionId(response)
        if (nextSubscriptionId) {
          remoteSubscriptionId = nextSubscriptionId
          if (stopped) {
            unwatchAndDropLocalSubscription()
            return
          }
        }
        // Why: the server publishes cancellation ownership before native setup;
        // callers should still become ready only after the watcher is live.
        if (isFileWatchStartingResponse(response)) {
          return
        }
        if (!stopped) {
          callbacks.onResponse(response)
          if (pendingReplayResync && nextSubscriptionId && response.ok) {
            pendingReplayResync = false
            // Why: a replayed watch reports changes only from its own native
            // setup; the reconnect gap produced no events, so consumers must
            // conservatively re-scan once the replacement is ready.
            callbacks.onResponse(createFileWatchReplayOverflowResponse(response, params))
          }
        } else if (response.ok === false) {
          dropLocalSubscription()
        }
      },
      onError: (error) => {
        if (!stopped) {
          callbacks.onError?.(error)
        }
      },
      onClose: () => {
        if (!stopped) {
          callbacks.onClose?.()
        }
      },
      onTransportInterrupted: () => {
        transportInterrupted = true
        remoteSubscriptionId = null
        if (!stopped) {
          return
        }
        const retries = this.fileWatchTeardownRetries.get(teardownKey)
        retries?.delete(retryRemoteUnwatch)
        if (retries?.size === 0) {
          this.fileWatchTeardownRetries.delete(teardownKey)
        }
        // Why: socket close physically releases the old server subscription;
        // a locally stopped watch must not be replayed on the replacement.
        dropLocalSubscription()
      },
      onTransportReplayed: () => {
        transportInterrupted = false
        pendingReplayResync = true
      }
    }
    handle = await this.subscribeOnCurrentConnection(
      LEGACY_RUNTIME_STREAM_METHODS.filesWatch,
      params,
      wrappedCallbacks,
      options
    )

    return {
      unsubscribe: () => {
        if (stopped) {
          return
        }
        stopped = true
        if (remoteSubscriptionId) {
          unwatchAndDropLocalSubscription()
        } else if (transportInterrupted) {
          // Why: socket close already released the old server subscription;
          // remove its replay record instead of reviving a locally stopped watch.
          dropLocalSubscription()
        }
        // Why: an older server may not publish its id until ready. Retain the
        // callback so a late response can still physically unwatch the root.
      },
      sendBinary: (bytes) => handle?.sendBinary(bytes)
    }
  }

  private async subscribeOnCurrentConnection(
    method: string,
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: SubscribeOptions
  ): Promise<WebRuntimeSubscriptionHandle> {
    await this.waitForConnected(options?.timeoutMs)
    if (method === 'terminal.multiplex') {
      return this.subscribeTerminalMultiplexOnCurrentConnection(params, callbacks)
    }
    const id = this.nextId()
    const subscription: RuntimeSubscription = { id, method, params, callbacks, needsReplay: false }
    this.subscriptions.set(id, subscription)
    if (!this.sendEncrypted({ id, deviceToken: this.pairing.deviceToken, method, params })) {
      this.subscriptions.delete(id)
      throw new Error('Runtime host is not connected.')
    }
    return {
      unsubscribe: () => {
        this.subscriptions.delete(subscription.id)
        // Tell the server to reap its keyed cleanup (e.g. native-chat fs-watcher)
        // before the socket goes away. Best-effort: a closed socket already reaps.
        const teardown = options?.buildUnsubscribe?.(params)
        if (teardown) {
          this.sendEncrypted({
            id: this.nextId(),
            deviceToken: this.pairing.deviceToken,
            method: teardown.method,
            params: teardown.params
          })
        }
      },
      sendBinary: (bytes) => {
        this.sendEncryptedBinary(bytes)
      }
    }
  }

  private async subscribeTerminalMultiplexOnCurrentConnection(
    params: unknown,
    callbacks: SubscriptionCallbacks
  ): Promise<WebRuntimeSubscriptionHandle> {
    if (!this.authenticatedCapabilities.has(RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY)) {
      throw new Error('Runtime host does not support inbound terminal multiplex frames.')
    }
    const runtimeId = this.authenticatedRuntimeId
    if (!runtimeId) {
      throw new Error('Runtime host did not identify the terminal multiplex connection.')
    }
    const requestId = this.nextId()
    let subscription: WebTerminalMultiplexSubscription
    try {
      subscription = await openWebTerminalMultiplexSubscription({
        requestId,
        params,
        runtimeId,
        callbacks,
        sendText: (frame) => this.sendEncryptedText(frame),
        sendBinary: (frame) => this.sendEncryptedBinary(frame),
        onCreated: (created) => {
          this.terminalMultiplexSubscription = created
        }
      })
    } catch (error) {
      this.closeTerminalMultiplexSubscription(false)
      throw error
    }
    return {
      unsubscribe: () => {
        if (this.terminalMultiplexSubscription === subscription) {
          this.closeTerminalMultiplexSubscription(false)
        }
      },
      sendBinary: (bytes) => subscription.sendBinary(bytes)
    }
  }

  close(options: { notifySubscriptions?: boolean } = {}): void {
    const shouldNotifySubscriptions = options.notifySubscriptions ?? true
    this.intentionallyClosed = true
    for (const child of Array.from(this.childClients)) {
      child.close({ notifySubscriptions: shouldNotifySubscriptions })
    }
    this.childClients.clear()
    this.fileWatchTeardownRetries.clear()
    this.clearTimers()
    this.closeTerminalMultiplexSubscription(false)
    this.closeOrpcConnection()
    this.closeShellServicesChannel()
    this.rejectAllPending('Runtime host connection closed.')
    this.rejectAllWaiters(new Error('Runtime host connection closed.'))
    if (shouldNotifySubscriptions) {
      this.notifySubscriptionsClosed()
    } else {
      this.subscriptions.clear()
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.sharedKey = null
    this.preparedRelay = null
    this.setState('disconnected')
  }

  private openConnection(): void {
    if (this.intentionallyClosed) {
      return
    }
    const relayMachineId = this.pairing.relayMachineId
    if (relayMachineId) {
      this.setState('connecting')
      const keyPair = generateKeyPair()
      void createBrowserRelaySession(relayMachineId, publicKeyToBase64(keyPair.publicKey)).then(
        (session) => this.openSocket(session.socketUrl, { session, secretKey: keyPair.secretKey }),
        () => this.scheduleReconnect()
      )
      return
    }
    this.openSocket(this.pairing.endpoint, null)
  }

  private openSocket(endpoint: string, relay: PreparedRelayConnection | null): void {
    if (this.intentionallyClosed) {
      return
    }
    let ws: WebSocket
    try {
      ws = new WebSocket(endpoint)
    } catch (error) {
      this.rejectAllPending(error instanceof Error ? error.message : String(error))
      this.scheduleReconnect()
      return
    }

    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.sharedKey = null
    this.relayDeviceToken = null
    this.preparedRelay = relay
    this.authenticatedRuntimeId = null
    this.authenticatedCapabilities.clear()
    this.setState('connecting')

    this.connectTimer = window.setTimeout(() => {
      if (this.ws === ws && ws.readyState === WebSocket.CONNECTING) {
        ws.close()
        this.handleSocketClosed(ws)
      }
    }, CONNECT_TIMEOUT_MS)

    ws.onopen = () => {
      if (this.ws !== ws) {
        return
      }
      this.clearConnectTimer()
      this.setState('handshaking')
      if (relay) {
        this.sharedKey = deriveSharedKey(
          relay.secretKey,
          publicKeyFromBase64(relay.session.runtimePublicKeyB64)
        )
        ws.send(JSON.stringify(relay.session.auth))
      } else {
        const keyPair = generateKeyPair()
        if (!this.serverPublicKey) {
          ws.close()
          return
        }
        this.sharedKey = deriveSharedKey(keyPair.secretKey, this.serverPublicKey)
        ws.send(
          JSON.stringify({
            type: 'e2ee_hello',
            publicKeyB64: publicKeyToBase64(keyPair.publicKey)
          })
        )
      }
      this.handshakeTimer = window.setTimeout(() => {
        if (this.ws === ws && this.state === 'handshaking') {
          ws.close()
        }
      }, HANDSHAKE_TIMEOUT_MS)
    }

    ws.onmessage = (event) => {
      // Why: stale socket callbacks can arrive after reconnect swaps this.ws;
      // they must not drive auth or subscription state on the replacement.
      if (this.ws !== ws) {
        return
      }
      // Why: any inbound frame (RPC reply, subscription push, keepalive, probe
      // echo) proves the socket is alive — reset the liveness watchdog and clear
      // any outstanding probe.
      this.lastInboundFrameAt = Date.now()
      this.heartbeatProbeSentAt = null
      void this.handleSocketMessage(event.data, ws)
    }

    ws.onclose = () => this.handleSocketClosed(ws)
    ws.onerror = () => {
      if (this.state === 'connecting') {
        this.rejectAllWaiters(
          new Error(
            withRemoteRuntimeTailscaleHint(
              'Could not connect to the runtime host.',
              this.pairing.endpoint
            )
          )
        )
      }
    }
  }

  private async handleSocketMessage(rawData: unknown, sourceWs?: WebSocket): Promise<void> {
    const raw = typeof rawData === 'string' ? rawData : null
    if (this.state === 'handshaking') {
      if (raw === null || !this.sharedKey) {
        return
      }
      try {
        const control: unknown = JSON.parse(raw)
        const ready = readMachineBrowserReady(control)
        if (ready) {
          if (!(await this.acceptMachineBrowserReady(ready))) {
            sourceWs?.close()
          }
          return
        }
        if (isControlType(control, 'e2ee_ready')) {
          const deviceToken = this.pairing.relayMachineId
            ? this.relayDeviceToken
            : this.pairing.deviceToken
          if (deviceToken) {
            this.sendEncrypted({ type: 'e2ee_auth', deviceToken })
          }
          return
        }
      } catch {
        // The authenticated control frame is encrypted, so non-JSON is normal here.
      }

      const plaintext = decrypt(raw, this.sharedKey)
      if (plaintext === null) {
        return
      }
      try {
        const control = JSON.parse(plaintext) as {
          type?: unknown
          error?: { code?: string; message?: string }
          runtimeId?: unknown
          capabilities?: unknown
        }
        if (control.type === 'e2ee_authenticated') {
          if (typeof control.runtimeId === 'string' && control.runtimeId.length > 0) {
            this.publishRuntimeId(control.runtimeId)
          }
          if (Array.isArray(control.capabilities)) {
            for (const capability of control.capabilities) {
              if (typeof capability === 'string') {
                this.authenticatedCapabilities.add(capability)
              }
            }
          }
          this.clearHandshakeTimer()
          this.reconnectAttempt = 0
          if (this.options.enableShellServices !== false) {
            this.openShellServicesChannel()
          }
          this.setState('connected')
        } else if (control.type === 'e2ee_error' || control.error?.code === 'unauthorized') {
          this.handleAuthorizationFailure()
        }
      } catch {
        // Ignore malformed handshake payloads; the server will close on timeout.
      }
      return
    }

    if (this.state !== 'connected' || !this.sharedKey) {
      return
    }

    if (raw === null) {
      const encrypted = await websocketPayloadToUint8(rawData)
      if (sourceWs && this.ws !== sourceWs) {
        return
      }
      if (!encrypted) {
        return
      }
      const plaintext = decryptBytes(encrypted, this.sharedKey)
      if (!plaintext) {
        return
      }
      if (this.terminalMultiplexSubscription) {
        if (!this.terminalMultiplexSubscription.receiveBinary(plaintext)) {
          sourceWs?.close()
        }
        return
      }
      if (this.shellServicesChannel?.receiveBinary(plaintext)) {
        return
      }
      if (this.orpcConnection?.channel.receiveBinary(plaintext)) {
        return
      }
      for (const subscription of this.subscriptions.values()) {
        subscription.callbacks.onBinary?.(plaintext)
      }
      return
    }

    const plaintext = decrypt(raw, this.sharedKey)
    if (plaintext === null) {
      return
    }
    if (this.terminalMultiplexSubscription) {
      if (!this.terminalMultiplexSubscription.receiveText(plaintext)) {
        sourceWs?.close()
      }
      return
    }
    if (this.shellServicesChannel?.receiveText(plaintext)) {
      return
    }
    if (this.orpcConnection?.channel.receiveText(plaintext)) {
      return
    }

    let response: RuntimeRpcResponse<unknown> | Record<string, unknown>
    try {
      response = JSON.parse(plaintext) as RuntimeRpcResponse<unknown> | Record<string, unknown>
    } catch {
      return
    }
    if (isKeepaliveFrame(response)) {
      return
    }
    if (!('id' in response) || typeof response.id !== 'string') {
      return
    }
    if (isRuntimeFailureResponse(response) && response.error.code === 'unauthorized') {
      this.handleAuthorizationFailure()
      return
    }

    const subscription = this.subscriptions.get(response.id)
    if (subscription) {
      const subscriptionResponse = response as RuntimeRpcResponse<unknown>
      // Why: setup failures must be evicted before callbacks so reconnect cannot replay them.
      if (subscriptionResponse.ok === false) {
        this.subscriptions.delete(response.id)
      }
      // Why: subscription-backed unary RPCs can return ordinary success frames.
      subscription.callbacks.onResponse(subscriptionResponse)
      if (subscriptionResponse.ok && isEndResult(subscriptionResponse.result)) {
        this.subscriptions.delete(response.id)
        subscription.callbacks.onClose?.()
      }
      return
    }

    const pending = this.pending.get(response.id)
    if (!pending) {
      return
    }
    this.pending.delete(response.id)
    window.clearTimeout(pending.timeout)
    pending.removeAbortListener()
    this.recordRuntimeId(response as RuntimeRpcResponse<unknown>)
    pending.resolve(response as RuntimeRpcResponse<unknown>)
  }

  private sendEncrypted(message: unknown): boolean {
    return this.sendEncryptedText(JSON.stringify(message))
  }

  private async acceptMachineBrowserReady(ready: MachineBrowserReady): Promise<boolean> {
    const relay = this.preparedRelay
    const machineSigningKey = this.pairing.relayMachineSigningKey
    if (
      !relay ||
      !machineSigningKey ||
      ready.machineId !== relay.session.auth.machineId ||
      ready.browserE2eePublicKeyB64 !== relay.session.auth.e2eePublicKeyB64 ||
      ready.runtimePublicKeyB64 !== relay.session.runtimePublicKeyB64 ||
      !(await verifyMachineBrowserReady(ready, machineSigningKey))
    ) {
      return false
    }
    const machineSharedKey = deriveSharedKey(
      relay.secretKey,
      publicKeyFromBase64(ready.machineE2eePublicKeyB64)
    )
    const tokenBytes = decryptBytes(
      bytesFromBase64(ready.encryptedDeviceTokenB64),
      machineSharedKey
    )
    if (!tokenBytes) {
      return false
    }
    this.relayDeviceToken = new TextDecoder().decode(tokenBytes)
    return this.relayDeviceToken.length > 0
  }

  private sendEncryptedText(plaintext: string): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.sharedKey) {
      return false
    }
    ws.send(encrypt(plaintext, this.sharedKey))
    return true
  }

  private sendEncryptedBinary(bytes: Uint8Array<ArrayBufferLike>): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.sharedKey) {
      return false
    }
    ws.send(encryptBytes(bytes, this.sharedKey))
    return true
  }

  private waitForConnected(timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<void> {
    if (this.state === 'connected') {
      return Promise.resolve()
    }
    if (this.state === 'auth-failed') {
      return Promise.reject(new Error('Unauthorized. Pair this web client again.'))
    }
    if (this.intentionallyClosed) {
      return Promise.reject(new Error('Runtime host connection closed.'))
    }
    if (signal?.aborted) {
      return Promise.reject(abortError(signal))
    }
    return new Promise((resolve, reject) => {
      const removeWaiter = (): void => {
        const index = this.waiters.indexOf(waiter)
        if (index !== -1) {
          this.waiters.splice(index, 1)
        }
      }
      const abort = (): void => {
        removeWaiter()
        window.clearTimeout(timeout)
        reject(abortError(signal))
      }
      const timeout = window.setTimeout(() => {
        removeWaiter()
        signal?.removeEventListener('abort', abort)
        reject(
          new Error(
            withRemoteRuntimeTailscaleHint(
              'Timed out while connecting to the runtime host.',
              this.pairing.endpoint
            )
          )
        )
      }, timeoutMs)
      const waiter = {
        resolve: () => {
          window.clearTimeout(timeout)
          signal?.removeEventListener('abort', abort)
          resolve()
        },
        reject: (error: Error) => {
          window.clearTimeout(timeout)
          signal?.removeEventListener('abort', abort)
          reject(error)
        }
      }
      signal?.addEventListener('abort', abort, { once: true })
      this.waiters.push(waiter)
    })
  }

  private handleSocketClosed(closedWs: WebSocket): void {
    if (this.ws !== closedWs) {
      return
    }
    this.ws = null
    this.sharedKey = null
    this.preparedRelay = null
    this.closeTerminalMultiplexSubscription(true)
    this.closeOrpcConnection()
    this.closeShellServicesChannel()
    this.legacyOrpcClient = null
    this.orpcClientPromise = null
    this.orpcTransport = 'unknown'
    this.clearConnectTimer()
    this.clearHandshakeTimer()
    this.clearHeartbeatTimer()
    this.rejectAllPending('Runtime host connection interrupted.')
    this.handleInterruptedSubscriptions()
    if (this.intentionallyClosed || this.state === 'auth-failed') {
      this.setState(this.state === 'auth-failed' ? 'auth-failed' : 'disconnected')
      return
    }
    this.setState('disconnected')
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionallyClosed) {
      return
    }
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]
    this.reconnectAttempt += 1
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.openConnection()
    }, delay)
  }

  private closeOrpcConnection(): void {
    this.orpcConnection?.channel.close()
    this.orpcConnection = null
  }

  private closeTerminalMultiplexSubscription(transportClosed: boolean): void {
    const subscription = this.terminalMultiplexSubscription
    this.terminalMultiplexSubscription = null
    if (transportClosed) {
      subscription?.transportClosed()
    } else {
      subscription?.close()
    }
  }

  private openShellServicesChannel(): void {
    this.closeShellServicesChannel()
    const channel = new WebShellServicesChannel(
      (plaintext) => this.sendEncryptedText(plaintext),
      (bytes) => this.sendEncryptedBinary(bytes),
      () => this.ws?.close()
    )
    this.shellServicesChannel = channel
    if (!channel.connect()) {
      this.closeShellServicesChannel()
      this.ws?.close()
    }
  }

  private closeShellServicesChannel(): void {
    this.shellServicesChannel?.close()
    this.shellServicesChannel = null
  }

  private handleAuthorizationFailure(): void {
    this.intentionallyClosed = true
    this.setState('auth-failed')
    this.rejectAllPending('Unauthorized. Pair this web client again.')
    this.notifySubscriptionsError('unauthorized', 'Unauthorized. Pair this web client again.')
    this.ws?.close()
  }

  private setState(next: WebRuntimeConnectionState): void {
    this.state = next
    if (next === 'connected') {
      this.replayInterruptedSubscriptions()
      this.startHeartbeat()
      for (const waiter of this.waiters.splice(0)) {
        waiter.resolve()
      }
    } else if (next === 'auth-failed') {
      this.rejectAllWaiters(new Error('Unauthorized. Pair this web client again.'))
    }
  }

  private nextId(): string {
    this.requestCounter += 1
    return `web-rpc-${this.requestCounter}-${Date.now()}`
  }

  private rejectAllPending(reason: string): void {
    const error = new Error(reason)
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      window.clearTimeout(pending.timeout)
      pending.removeAbortListener()
      pending.reject(error)
    }
  }

  private rejectAllWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error)
    }
  }

  private notifySubscriptionsClosed(): void {
    const subscriptions = Array.from(this.subscriptions.values())
    this.subscriptions.clear()
    for (const subscription of subscriptions) {
      subscription.callbacks.onClose?.()
    }
  }

  private handleInterruptedSubscriptions(): void {
    for (const [id, subscription] of Array.from(this.subscriptions)) {
      if (!SHARED_CONNECTION_SUBSCRIPTION_METHODS.has(subscription.method)) {
        this.subscriptions.delete(id)
        subscription.callbacks.onClose?.()
        continue
      }
      subscription.callbacks.onTransportInterrupted?.()
      if (this.subscriptions.get(subscription.id) === subscription) {
        subscription.needsReplay = true
      }
    }
  }

  private replayInterruptedSubscriptions(): void {
    for (const subscription of Array.from(this.subscriptions.values())) {
      if (!subscription.needsReplay) {
        continue
      }
      this.subscriptions.delete(subscription.id)
      subscription.id = this.nextId()
      subscription.needsReplay = false
      this.subscriptions.set(subscription.id, subscription)
      if (
        this.sendEncrypted({
          id: subscription.id,
          deviceToken: this.pairing.deviceToken,
          method: subscription.method,
          params: subscription.params
        })
      ) {
        subscription.callbacks.onTransportReplayed?.()
      } else {
        subscription.needsReplay = true
      }
    }
  }

  private notifySubscriptionsError(code: string, message: string): void {
    const subscriptions = Array.from(this.subscriptions.values())
    this.subscriptions.clear()
    for (const subscription of subscriptions) {
      subscription.callbacks.onError?.({ code, message })
    }
  }

  private clearTimers(): void {
    this.clearConnectTimer()
    this.clearHandshakeTimer()
    this.clearHeartbeatTimer()
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      window.clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      window.clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeatTimer()
    const now = Date.now()
    this.lastInboundFrameAt = now
    this.lastHeartbeatTickAt = now
    this.heartbeatProbeSentAt = null
    this.heartbeatTimer = window.setInterval(() => this.runHeartbeatTick(), HEARTBEAT_INTERVAL_MS)
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.heartbeatProbeSentAt = null
  }

  private runHeartbeatTick(): void {
    const now = Date.now()
    // Why: if this tick lands far later than scheduled, the loop was suspended
    // (backgrounded/frozen tab) — that gap is NOT evidence the socket died, so
    // re-baseline the liveness clocks and drop any stale probe before judging.
    const sinceLastTick = now - this.lastHeartbeatTickAt
    this.lastHeartbeatTickAt = now
    if (sinceLastTick >= HEARTBEAT_INTERVAL_MS * 2) {
      this.lastInboundFrameAt = now
      this.heartbeatProbeSentAt = null
    }
    // Why: a backgrounded tab shows no live data and the user can't see
    // staleness, so don't spend battery probing; the next visible tick re-checks.
    if (document.visibilityState === 'hidden') {
      return
    }
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || this.state !== 'connected') {
      return
    }
    // Why: close ONLY when a probe we actually sent has gone unanswered past the
    // grace window — never on raw accumulated silence. This guarantees at least
    // one real round-trip attempt before declaring the socket half-open.
    if (
      this.heartbeatProbeSentAt !== null &&
      now - this.heartbeatProbeSentAt >= HEARTBEAT_PROBE_GRACE_MS
    ) {
      ws.close()
      this.handleSocketClosed(ws)
      return
    }
    if (this.heartbeatProbeSentAt === null && now - this.lastInboundFrameAt >= HEARTBEAT_IDLE_MS) {
      this.sendHeartbeatProbe(now)
    }
  }

  private sendHeartbeatProbe(now: number): void {
    if (this.pairing.scope === 'runtime' || this.orpcTransport === 'peer') {
      this.heartbeatProbeSentAt = now
      void this.getPeerOrpcClient()
        .status.get(undefined, { signal: AbortSignal.timeout(HEARTBEAT_PROBE_GRACE_MS) })
        .then((status) => this.publishRuntimeId(status.runtimeId))
        .catch(() => {})
      return
    }
    // Why: legacy hosts still need the envelope probe. Its unmatched id keeps
    // the heartbeat fire-and-forget; any inbound reply clears the probe clock.
    if (
      this.sendEncrypted(
        createLegacyRuntimeHeartbeatRequest(
          `web-heartbeat-${this.nextId()}`,
          this.pairing.deviceToken
        )
      )
    ) {
      this.heartbeatProbeSentAt = now
    }
  }

  private getLegacyOrpcClient(): WebRuntimeOrpcClient {
    if (!this.legacyOrpcClient) {
      this.legacyOrpcClient = createLegacyRuntimeOrpcClient((method, input, options) =>
        this.call(method, input, options)
      )
    }
    return this.legacyOrpcClient
  }

  private getPeerOrpcClient(): WebRuntimeOrpcClient {
    if (!this.orpcConnection) {
      this.orpcConnection = createWebRuntimeOrpcConnection(
        (plaintext) => this.sendEncryptedText(plaintext),
        (bytes) => this.sendEncryptedBinary(bytes),
        () => this.handleAuthorizationFailure()
      )
    }
    return this.orpcConnection.client
  }

  private async negotiateOrpcClient(
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient> {
    const negotiationSignal = signal ?? AbortSignal.timeout(timeoutMs)
    const status = await this.getLegacyOrpcClient().status.get(undefined, {
      signal: negotiationSignal
    })
    this.publishRuntimeId(status.runtimeId)
    if (status.capabilities?.includes(RUNTIME_ORPC_RUNTIME_CAPABILITY)) {
      this.orpcTransport = 'peer'
      return this.getPeerOrpcClient()
    }
    this.orpcTransport = 'legacy'
    return this.getLegacyOrpcClient()
  }

  private async connectRuntimeOrpcClient(
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient> {
    const client = this.getPeerOrpcClient()
    const status = await client.status.get(undefined, {
      signal: signal ?? AbortSignal.timeout(timeoutMs)
    })
    this.publishRuntimeId(status.runtimeId)
    this.orpcTransport = 'peer'
    return client
  }

  private recordRuntimeId(response: RuntimeRpcResponse<unknown>): void {
    const runtimeId = response._meta?.runtimeId
    if (runtimeId) {
      this.publishRuntimeId(runtimeId)
    }
  }

  private publishRuntimeId(runtimeId: string): void {
    this.authenticatedRuntimeId = runtimeId
    try {
      this.onRuntimeId(runtimeId)
    } catch (error) {
      console.warn('Failed to persist the web runtime identity:', error)
    }
  }
}

function abortError(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError')
}

function isControlType(value: unknown, type: string): boolean {
  return !!value && typeof value === 'object' && Reflect.get(value, 'type') === type
}

function isRuntimeFailureResponse(
  response: RuntimeRpcResponse<unknown> | Record<string, unknown>
): response is RuntimeRpcResponse<unknown> & { ok: false } {
  return (
    'ok' in response &&
    response.ok === false &&
    'error' in response &&
    !!response.error &&
    typeof response.error === 'object' &&
    'code' in response.error
  )
}

function getFileWatchSubscriptionId(response: RuntimeRpcResponse<unknown>): string | null {
  if (!response.ok) {
    return null
  }
  const result = response.result
  if (!result || typeof result !== 'object') {
    return null
  }
  const subscriptionId = (result as { subscriptionId?: unknown }).subscriptionId
  return typeof subscriptionId === 'string' ? subscriptionId : null
}

function createFileWatchReplayOverflowResponse(
  readyResponse: RuntimeRpcSuccess<unknown>,
  params: unknown
): RuntimeRpcSuccess<{
  type: 'changed'
  worktree: string
  events: { kind: 'overflow'; absolutePath: string }[]
}> {
  const worktree = (params as { worktree?: unknown } | null)?.worktree
  return {
    id: readyResponse.id,
    ok: true,
    result: {
      type: 'changed',
      worktree: typeof worktree === 'string' ? worktree : '',
      // Why: overflow consumers re-scan the whole root and never read the
      // path; the client does not know the server-side root path here.
      events: [{ kind: 'overflow', absolutePath: '' }]
    },
    _meta: readyResponse._meta
  }
}

function isFileWatchStartingResponse(
  response: RuntimeRpcResponse<unknown>
): response is RuntimeRpcSuccess<{ type: 'starting'; subscriptionId: string }> {
  return (
    response.ok &&
    !!response.result &&
    typeof response.result === 'object' &&
    (response.result as { type?: unknown }).type === 'starting'
  )
}

function isEndResult(value: unknown): value is { type: 'end' } {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'end'
}

async function websocketPayloadToUint8(
  value: unknown
): Promise<Uint8Array<ArrayBufferLike> | null> {
  if (value instanceof Uint8Array) {
    return value
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer())
  }
  return null
}
