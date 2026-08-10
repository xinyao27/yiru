/* oxlint-disable max-lines -- Why: one-shot and the remaining legacy subscription
 * callers still share E2EE handshake and response state; split them only when
 * those callers move to the dedicated oRPC peer introduced for multiplex. */
import { randomUUID } from 'node:crypto'

import { createWsOutboundBackpressureQueue } from '@yiru/mobile-relay-protocol/outbound-backpressure'
import { RUNTIME_ORPC_REQUEST_ID_HEADER } from '@yiru/runtime-protocol/orpc-peer-frame'
import {
  isKeepaliveFrame,
  RuntimeRpcEnvelopeSchema,
  type RuntimeOrchestrationEnvelope,
  type RuntimeRpcResponse
} from '@yiru/runtime-protocol/rpc-envelope'
import WebSocket from 'ws'

import {
  decrypt,
  decryptBytes,
  deriveSharedKey,
  encrypt,
  encryptBytes,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from '../e2ee-crypto'
import type { PairingOffer } from '../pairing'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '../runtime-method-contract'
import { RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY } from '../runtime-orpc-socket'
// Re-export so existing value importers of `RemoteRuntimeClientError` are
// unaffected; the class lives in a ws-free module so type-only consumers
// (and mobile's typecheck) don't compile this file's Node-only deps.
import { RemoteRuntimeClientError } from './client-error'
import { DedicatedRemoteRuntimeOrpcPeer } from './dedicated-orpc-peer'
import {
  startRemoteRuntimeSocketLiveness,
  type RemoteRuntimeSocketLivenessMonitor,
  type RemoteRuntimeSocketLivenessOptions
} from './socket-liveness'

export { RemoteRuntimeClientError } from './client-error'

type HandshakeState = 'awaiting_ready' | 'awaiting_authenticated' | 'ready'

function ignoreSettledRemoteRuntimeSocketError(): void {}

function formatRemoteRuntimeCloseMessage(code: number, reason: Buffer): string {
  const suffixParts: string[] = []
  if (code !== 1005 && code !== 1006) {
    suffixParts.push(String(code))
  }
  const reasonText = reason.toString().trim()
  if (reasonText) {
    suffixParts.push(reasonText)
  }
  return suffixParts.length > 0
    ? `Runtime host closed the connection (${suffixParts.join(': ')}).`
    : 'Runtime host closed the connection.'
}

export type RemoteRuntimeSubscription = {
  requestId: string
  close: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean
}

export type RemoteRuntimeSubscriptionCallbacks<TResult = unknown> = {
  onResponse: (response: RuntimeRpcResponse<TResult>) => void
  onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
  onError: (error: RemoteRuntimeClientError) => void
  onClose?: () => void
}

export function sendRemoteRuntimeRequest<TContract extends RuntimeMethodContract>(
  pairing: PairingOffer,
  contract: TContract,
  params: RuntimeMethodParams<TContract>,
  timeoutMs: number,
  options?: { beforeSend?: () => void | Promise<void> } & RuntimeOrchestrationEnvelope
): Promise<RuntimeRpcResponse<RuntimeMethodResult<TContract>>>
export function sendRemoteRuntimeRequest<TResult>(
  pairing: PairingOffer,
  method: string,
  params: unknown,
  timeoutMs: number,
  options?: { beforeSend?: () => void | Promise<void> } & RuntimeOrchestrationEnvelope
): Promise<RuntimeRpcResponse<TResult>>
export async function sendRemoteRuntimeRequest<TResult>(
  pairing: PairingOffer,
  contract: string | RuntimeMethodContract,
  params: unknown,
  timeoutMs: number,
  options: { beforeSend?: () => void | Promise<void> } & RuntimeOrchestrationEnvelope = {}
): Promise<RuntimeRpcResponse<TResult>> {
  const method = typeof contract === 'string' ? contract : contract.name
  return await new Promise((resolve, reject) => {
    const requestId = randomUUID()
    const keyPair = generateKeyPair()
    const serverPublicKey = publicKeyFromBase64(pairing.publicKeyB64)
    const sharedKey = deriveSharedKey(keyPair.secretKey, serverPublicKey)
    let state: HandshakeState = 'awaiting_ready'
    let settled = false
    let ws: WebSocket | null = null

    const cleanupSocketListeners = (): void => {
      const socket = ws
      if (!socket) {
        return
      }
      socket.off('open', onOpen)
      socket.off('error', onError)
      socket.off('close', onClose)
      socket.off('message', onMessage)
      // Why: the settled one-shot no longer needs Yiru callbacks, but a ws
      // can still report a late transport error after close is requested.
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.on('error', ignoreSettledRemoteRuntimeSocketError)
      }
    }

    let timeout = setTimeout(onTimeout, timeoutMs)

    function onTimeout(): void {
      finish({
        ok: false,
        error: new RemoteRuntimeClientError(
          'runtime_timeout',
          'Timed out waiting for the runtime host to respond.'
        )
      })
    }

    function refreshTimeout(): void {
      const refreshableTimeout = timeout as { refresh?: () => void }
      if (typeof refreshableTimeout.refresh === 'function') {
        refreshableTimeout.refresh()
        return
      }
      // Why: mobile typechecks shared code with DOM timer types, where
      // setTimeout returns a number and Node's Timeout.refresh is absent.
      clearTimeout(timeout)
      timeout = setTimeout(onTimeout, timeoutMs)
    }

    const finish = (
      result: { ok: true; response: RuntimeRpcResponse<TResult> } | { ok: false; error: Error }
    ): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      try {
        cleanupSocketListeners()
        ws?.close()
      } catch {
        // ignore best-effort close
      }
      if (result.ok === false) {
        reject(result.error)
      } else {
        resolve(result.response)
      }
    }

    try {
      ws = new WebSocket(pairing.endpoint)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finish({
        ok: false,
        error: new RemoteRuntimeClientError(
          'invalid_argument',
          `Invalid remote endpoint: ${message}`
        )
      })
      return
    }

    function onOpen(): void {
      ws?.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(keyPair.publicKey)
        })
      )
    }

    function onError(): void {
      finish({
        ok: false,
        error: new RemoteRuntimeClientError(
          'remote_runtime_unavailable',
          'Could not connect to the runtime host.'
        )
      })
    }

    function onClose(code: number, reason: Buffer): void {
      if (!settled) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'remote_runtime_unavailable',
            formatRemoteRuntimeCloseMessage(code, reason)
          )
        })
      }
    }

    function onMessage(data: WebSocket.RawData, isBinary: boolean): void {
      if (settled) {
        return
      }
      if (isBinary) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an unexpected binary frame.'
          )
        })
        return
      }

      const frame = data.toString()
      if (state === 'awaiting_ready') {
        handleReadyFrame(frame)
        return
      }

      const plaintext = decrypt(frame, sharedKey)
      if (plaintext === null) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an undecryptable frame.'
          )
        })
        return
      }

      if (state === 'awaiting_authenticated') {
        void handleAuthenticatedFrame(plaintext)
        return
      }

      handleRpcFrame(plaintext)
    }

    ws.once('open', onOpen)
    ws.once('error', onError)
    ws.on('close', onClose)
    ws.on('message', onMessage)

    function handleReadyFrame(frame: string): void {
      let ready: unknown
      try {
        ready = JSON.parse(frame)
      } catch {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid E2EE handshake frame.'
          )
        })
        return
      }
      if (
        typeof ready !== 'object' ||
        ready === null ||
        (ready as { type?: unknown }).type !== 'e2ee_ready'
      ) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an unexpected E2EE handshake frame.'
          )
        })
        return
      }
      state = 'awaiting_authenticated'
      ws?.send(
        encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: pairing.deviceToken }), sharedKey)
      )
    }

    async function handleAuthenticatedFrame(plaintext: string): Promise<void> {
      let authenticated: unknown
      try {
        authenticated = JSON.parse(plaintext)
      } catch {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid E2EE auth frame.'
          )
        })
        return
      }
      const type = (authenticated as { type?: unknown }).type
      if (type !== 'e2ee_authenticated') {
        const code =
          typeof authenticated === 'object' &&
          authenticated !== null &&
          (authenticated as { error?: { code?: unknown } }).error?.code === 'unauthorized'
            ? 'unauthorized'
            : 'invalid_runtime_response'
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(code, 'Runtime host rejected the pairing token.')
        })
        return
      }
      state = 'ready'
      try {
        // Why: handshake latency must not let a revoked queued mutation cross the wire.
        await options.beforeSend?.()
      } catch (error) {
        finish({
          ok: false,
          error: error instanceof Error ? error : new Error(String(error))
        })
        return
      }
      if (settled || !ws || ws.readyState !== WebSocket.OPEN) {
        return
      }
      ws?.send(
        encrypt(
          JSON.stringify({
            id: requestId,
            deviceToken: pairing.deviceToken,
            method,
            params,
            orchestrationCapability: options.orchestrationCapability,
            orchestrationContractVersion: options.orchestrationContractVersion,
            orchestrationRequestId: options.orchestrationRequestId
          }),
          sharedKey
        )
      )
    }

    function handleRpcFrame(plaintext: string): void {
      let raw: unknown
      try {
        raw = JSON.parse(plaintext)
      } catch {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid response frame.'
          )
        })
        return
      }
      if (isKeepaliveFrame(raw)) {
        refreshTimeout()
        return
      }
      const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
      if (!parsed.success || '_keepalive' in parsed.data) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid response frame.'
          )
        })
        return
      }
      const response = parsed.data as RuntimeRpcResponse<TResult>
      if (response.id !== requestId) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned a mismatched response id.'
          )
        })
        return
      }
      finish({ ok: true, response })
    }
  })
}

function hasAuthenticatedCapability(value: unknown, capability: string): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const capabilities = (value as { capabilities?: unknown }).capabilities
  return Array.isArray(capabilities) && capabilities.includes(capability)
}

function authenticatedRuntimeId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const runtimeId = (value as { runtimeId?: unknown }).runtimeId
  return typeof runtimeId === 'string' && runtimeId.length > 0 ? runtimeId : null
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}

function invalidDedicatedOrpcFrame(): RemoteRuntimeClientError {
  return new RemoteRuntimeClientError(
    'invalid_runtime_response',
    'Runtime host returned an invalid dedicated oRPC frame.'
  )
}

function dedicatedOrpcError(error: unknown): RemoteRuntimeClientError {
  if (error instanceof RemoteRuntimeClientError) {
    return error
  }
  if (isOrpcError(error)) {
    return new RemoteRuntimeClientError(error.code, error.message)
  }
  return new RemoteRuntimeClientError(
    'remote_runtime_unavailable',
    error instanceof Error ? error.message : 'Dedicated runtime stream failed.'
  )
}

function isOrpcError(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

export async function subscribeRemoteRuntimeRequest<TResult>(
  pairing: PairingOffer,
  method: string,
  params: unknown,
  timeoutMs: number,
  callbacks: RemoteRuntimeSubscriptionCallbacks<TResult>,
  livenessOptions?: RemoteRuntimeSocketLivenessOptions
): Promise<RemoteRuntimeSubscription> {
  return await new Promise((resolve, reject) => {
    const requestId = randomUUID()
    const keyPair = generateKeyPair()
    const serverPublicKey = publicKeyFromBase64(pairing.publicKeyB64)
    const sharedKey = deriveSharedKey(keyPair.secretKey, serverPublicKey)
    let state: HandshakeState = 'awaiting_ready'
    let settled = false
    let ws: WebSocket | null = null
    let liveness: RemoteRuntimeSocketLivenessMonitor | null = null
    let dedicatedOrpcPeer: DedicatedRemoteRuntimeOrpcPeer | null = null
    let isSocketClosed = false
    let didNotifyClose = false
    const streamAbort = new AbortController()

    const notifyClose = (): void => {
      if (!didNotifyClose) {
        didNotifyClose = true
        callbacks.onClose?.()
      }
    }

    const cleanupSocketListeners = (): WebSocket | null => {
      liveness?.stop()
      liveness = null
      sendQueue?.dispose()
      sendQueue = null
      const socket = ws
      if (!socket) {
        return null
      }
      socket.off('open', onOpen)
      socket.off('error', onError)
      socket.off('close', onClose)
      socket.off('message', onMessage)
      socket.off('pong', onLivenessSignal)
      socket.off('ping', onLivenessSignal)
      ws = null
      // Why: startup failures detach Yiru callbacks before closing the ws,
      // but ws can still emit a late transport error while close is in flight.
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.on('error', ignoreSettledRemoteRuntimeSocketError)
      }
      return socket
    }

    const closeSocketAfterCleanup = (): void => {
      streamAbort.abort()
      dedicatedOrpcPeer?.close()
      const socket = cleanupSocketListeners()
      try {
        socket?.close()
      } catch {
        // ignore best-effort close
      }
    }

    const timeout = setTimeout(() => {
      fail(
        new RemoteRuntimeClientError(
          'runtime_timeout',
          'Timed out waiting for the runtime host subscription to start.'
        )
      )
    }, timeoutMs)

    const close = (): void => {
      streamAbort.abort()
      try {
        ws?.close()
      } catch {
        // ignore best-effort close
      }
    }

    // Why: client input (keystrokes) must never be dropped under backpressure.
    // Hold encrypted frames in order while bufferedAmount is over the cap and
    // drain as it clears; a wedged link (hard cap) fails the socket so the
    // renderer resubscribes and replays a fresh snapshot.
    let sendQueue: ReturnType<typeof createWsOutboundBackpressureQueue<Buffer>> | null = null
    const ensureSendQueue = (
      socket: WebSocket
    ): ReturnType<typeof createWsOutboundBackpressureQueue<Buffer>> => {
      if (!sendQueue) {
        sendQueue = createWsOutboundBackpressureQueue<Buffer>({
          send: (frame) => socket.send(frame, { binary: true }),
          byteLengthOf: (frame) => frame.byteLength,
          getBufferedAmount: () => socket.bufferedAmount,
          isWritable: () => socket.readyState === WebSocket.OPEN,
          onOverflow: () =>
            fail(
              new RemoteRuntimeClientError(
                'remote_runtime_unavailable',
                'Runtime host send buffer overflow; reconnecting.'
              )
            )
        })
      }
      return sendQueue
    }

    const sendBinary = (bytes: Uint8Array<ArrayBufferLike>): boolean => {
      if (state !== 'ready' || !ws || ws.readyState !== WebSocket.OPEN) {
        return false
      }
      ensureSendQueue(ws).enqueue(Buffer.from(encryptBytes(bytes, sharedKey)))
      return true
    }

    const sendOrpcText = (frame: string): boolean => {
      if (state !== 'ready' || !ws || ws.readyState !== WebSocket.OPEN) {
        return false
      }
      ws.send(encrypt(frame, sharedKey))
      return true
    }

    const succeed = (): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve({ requestId, close, sendBinary })
    }

    const fail = (error: RemoteRuntimeClientError): void => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        closeSocketAfterCleanup()
        reject(error)
        return
      }
      callbacks.onError(error)
      // Why: after a subscription is established, protocol failures are
      // terminal for this socket. Closing here releases the WebSocket listeners
      // and lets the IPC subscription registry drop its retained callbacks.
      closeSocketAfterCleanup()
      notifyClose()
    }

    try {
      ws = new WebSocket(pairing.endpoint)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fail(new RemoteRuntimeClientError('invalid_argument', `Invalid remote endpoint: ${message}`))
      return
    }

    function onOpen(): void {
      ws?.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(keyPair.publicKey)
        })
      )
    }

    function onError(): void {
      fail(
        new RemoteRuntimeClientError(
          'remote_runtime_unavailable',
          'Could not connect to the runtime host.'
        )
      )
    }

    function onClose(code: number, reason: Buffer): void {
      isSocketClosed = true
      streamAbort.abort()
      dedicatedOrpcPeer?.close()
      clearTimeout(timeout)
      cleanupSocketListeners()
      if (!settled) {
        settled = true
        reject(
          new RemoteRuntimeClientError(
            'remote_runtime_unavailable',
            formatRemoteRuntimeCloseMessage(code, reason)
          )
        )
        return
      }
      notifyClose()
    }

    function onMessage(data: WebSocket.RawData, isBinary: boolean): void {
      liveness?.noteActivity()
      if (isBinary) {
        handleBinaryFrame(new Uint8Array(data as Buffer))
        return
      }

      const frame = data.toString()
      if (state === 'awaiting_ready') {
        handleReadyFrame(frame)
        return
      }

      const plaintext = decrypt(frame, sharedKey)
      if (plaintext === null) {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an undecryptable frame.'
          )
        )
        return
      }

      if (state === 'awaiting_authenticated') {
        handleAuthenticatedFrame(plaintext)
        return
      }

      if (dedicatedOrpcPeer) {
        if (!dedicatedOrpcPeer.receiveText(plaintext)) {
          fail(invalidDedicatedOrpcFrame())
        }
        return
      }
      handleRpcFrame(plaintext)
    }

    function onLivenessSignal(): void {
      liveness?.noteActivity()
    }

    ws.once('open', onOpen)
    ws.once('error', onError)
    ws.on('close', onClose)
    ws.on('message', onMessage)
    ws.on('pong', onLivenessSignal)
    ws.on('ping', onLivenessSignal)

    // Why: dedicated stream sockets (terminal.multiplex, browser.screencast)
    // ride the same tunnels as shared control; a half-open drop must surface
    // as a close so the renderer's onTransportClose resubscribe path runs
    // instead of freezing the stream forever (#7718/#7489).
    const monitoredWs = ws
    liveness = startRemoteRuntimeSocketLiveness({
      ping: () => {
        if (monitoredWs.readyState === WebSocket.OPEN) {
          monitoredWs.ping()
        }
      },
      onDead: () => {
        // Why: fail() first so listeners detach before terminate's close event;
        // otherwise the close handler would emit a second onClose to callers.
        fail(
          new RemoteRuntimeClientError(
            'remote_runtime_unavailable',
            'Runtime host stopped responding; the stream connection was reset.'
          )
        )
        try {
          // Why: close() on a half-open socket can hang for the OS TCP timeout.
          monitoredWs.terminate()
        } catch {
          // Best-effort terminate; the subscription is already settled.
        }
      },
      options: livenessOptions
    })

    function handleReadyFrame(frame: string): void {
      let ready: unknown
      try {
        ready = JSON.parse(frame)
      } catch {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid E2EE handshake frame.'
          )
        )
        return
      }
      if (
        typeof ready !== 'object' ||
        ready === null ||
        (ready as { type?: unknown }).type !== 'e2ee_ready'
      ) {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an unexpected E2EE handshake frame.'
          )
        )
        return
      }
      state = 'awaiting_authenticated'
      ws?.send(
        encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: pairing.deviceToken }), sharedKey)
      )
    }

    function handleAuthenticatedFrame(plaintext: string): void {
      let authenticated: unknown
      try {
        authenticated = JSON.parse(plaintext)
      } catch {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid E2EE auth frame.'
          )
        )
        return
      }
      const type = (authenticated as { type?: unknown }).type
      if (type !== 'e2ee_authenticated') {
        const code =
          typeof authenticated === 'object' &&
          authenticated !== null &&
          (authenticated as { error?: { code?: unknown } }).error?.code === 'unauthorized'
            ? 'unauthorized'
            : 'invalid_runtime_response'
        fail(new RemoteRuntimeClientError(code, 'Runtime host rejected the pairing token.'))
        return
      }
      if (
        method === 'terminal.multiplex' &&
        !hasAuthenticatedCapability(authenticated, RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY)
      ) {
        fail(
          new RemoteRuntimeClientError(
            'binary_terminal_stream_unsupported',
            'Runtime host does not support the dedicated inbound binary terminal stream.'
          )
        )
        return
      }
      state = 'ready'
      if (method === 'terminal.multiplex') {
        const runtimeId = authenticatedRuntimeId(authenticated)
        if (!runtimeId) {
          fail(
            new RemoteRuntimeClientError(
              'invalid_runtime_response',
              'Runtime host did not identify the authenticated runtime.'
            )
          )
          return
        }
        dedicatedOrpcPeer = new DedicatedRemoteRuntimeOrpcPeer(sendOrpcText, sendBinary, (frame) =>
          callbacks.onBinary?.(frame)
        )
        void startDedicatedOrpcSubscription(runtimeId)
        return
      }
      ws?.send(
        encrypt(
          JSON.stringify({
            id: requestId,
            deviceToken: pairing.deviceToken,
            method,
            params
          }),
          sharedKey
        )
      )
      succeed()
    }

    async function startDedicatedOrpcSubscription(runtimeId: string): Promise<void> {
      const peer = dedicatedOrpcPeer
      if (!peer) {
        fail(invalidDedicatedOrpcFrame())
        return
      }
      try {
        const { RPCLink } = await import('@orpc/client/websocket')
        const link = new RPCLink<Record<never, never>>({
          websocket: peer,
          headers: { [RUNTIME_ORPC_REQUEST_ID_HEADER]: requestId }
        })
        const output = await link.call(method.split('.'), params, {
          context: {},
          signal: streamAbort.signal
        })
        if (!isAsyncIterable(output)) {
          fail(invalidDedicatedOrpcFrame())
          return
        }
        succeed()
        void consumeDedicatedOrpcSubscription(output, runtimeId)
      } catch (error) {
        if (!streamAbort.signal.aborted && !isSocketClosed) {
          fail(dedicatedOrpcError(error))
        }
      }
    }

    async function consumeDedicatedOrpcSubscription(
      output: AsyncIterable<unknown>,
      runtimeId: string
    ): Promise<void> {
      try {
        for await (const result of output) {
          callbacks.onResponse({
            id: requestId,
            ok: true,
            result: result as TResult,
            _meta: { runtimeId }
          })
        }
        closeSocketAfterCleanup()
        notifyClose()
      } catch (error) {
        if (!streamAbort.signal.aborted && !isSocketClosed) {
          fail(dedicatedOrpcError(error))
        }
      }
    }

    function handleRpcFrame(plaintext: string): void {
      let raw: unknown
      try {
        raw = JSON.parse(plaintext)
      } catch {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid response frame.'
          )
        )
        return
      }
      const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
      if (!parsed.success || '_keepalive' in parsed.data) {
        return
      }
      const response = parsed.data as RuntimeRpcResponse<TResult>
      if (response.id !== requestId) {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned a mismatched response id.'
          )
        )
        return
      }
      callbacks.onResponse(response)
    }

    function handleBinaryFrame(frame: Uint8Array<ArrayBufferLike>): void {
      if (state !== 'ready') {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned binary data before authentication.'
          )
        )
        return
      }
      const plaintext = decryptBytes(frame, sharedKey)
      if (plaintext === null) {
        fail(
          new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an undecryptable binary frame.'
          )
        )
        return
      }
      if (dedicatedOrpcPeer) {
        if (!dedicatedOrpcPeer.receiveBinary(plaintext)) {
          fail(invalidDedicatedOrpcFrame())
        }
        return
      }
      callbacks.onBinary?.(plaintext)
    }
  })
}
