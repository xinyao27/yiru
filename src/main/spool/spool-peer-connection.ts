import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { decrypt, deriveSharedKey, encrypt, publicKeyFromBase64 } from '../../shared/e2ee-crypto'
import type { SpoolConnectionState } from '../../shared/spool/spool-wire-contract'
import {
  SPOOL_CONNECT_PATH,
  SPOOL_INGRESS_PORT,
  SPOOL_MAX_ENCRYPTED_FRAME_BYTES
} from '../../shared/spool/spool-wire-contract'
import type { SpoolPeerAdmission } from './spool-probe-client'
import {
  SpoolPeerConnectionError,
  type SpoolSink,
  type SpoolSubscription
} from './spool-peer-connection-contract'
import { SPOOL_CANCEL_SUBSCRIPTION_METHOD } from './spool-rpc-stream'
import {
  clearPendingTimeout,
  dispatchSpoolPeerResponse,
  type SpoolPendingPeerRequest
} from './spool-peer-response-dispatch'
import {
  formatSpoolPeerAddress,
  isSpoolAuthenticatedFrame,
  isSpoolReadyFrame
} from './spool-peer-handshake'
import { startSpoolWebSocketHeartbeat } from './spool-websocket-heartbeat'

export {
  SpoolPeerConnectionError,
  type SpoolSink,
  type SpoolSubscription
} from './spool-peer-connection-contract'

const SPOOL_CONNECT_TIMEOUT_MS = 10_000
const SPOOL_REQUEST_TIMEOUT_MS = 30_000

type PeerState = 'idle' | 'awaiting-ready' | 'awaiting-authenticated' | 'ready' | 'closed'

export class SpoolPeerConnection {
  private socket: WebSocket | null = null
  private sharedKey: Uint8Array | null = null
  private state: PeerState = 'idle'
  private connectionEpoch = 0
  private readonly pending = new Map<string, SpoolPendingPeerRequest>()
  private readonly stateListeners = new Set<(state: SpoolConnectionState) => void>()
  private readyWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null
  private stopHeartbeat: (() => void) | null = null

  constructor(private readonly admission: SpoolPeerAdmission) {}

  connect(): Promise<void> {
    if (this.state !== 'idle') {
      return this.state === 'ready'
        ? Promise.resolve()
        : Promise.reject(new SpoolPeerConnectionError('protocol_error'))
    }
    this.publish({ status: 'connecting', connectionEpoch: this.connectionEpoch })
    this.state = 'awaiting-ready'
    const endpoint = `ws://${formatSpoolPeerAddress(this.admission.address)}:${SPOOL_INGRESS_PORT}${SPOOL_CONNECT_PATH}`
    const socket = new WebSocket(endpoint, {
      followRedirects: false,
      handshakeTimeout: SPOOL_CONNECT_TIMEOUT_MS,
      maxPayload: SPOOL_MAX_ENCRYPTED_FRAME_BYTES,
      perMessageDeflate: false
    })
    this.socket = socket
    this.sharedKey = deriveSharedKey(
      this.admission.clientSecretKey,
      publicKeyFromBase64(this.admission.response.ownerPublicKeyB64)
    )
    socket.on('open', () => {
      this.stopHeartbeat = startSpoolWebSocketHeartbeat(socket, () =>
        this.handleLoss(new SpoolPeerConnectionError('disconnected'))
      )
      socket.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: this.admission.clientPublicKeyB64
        })
      )
    })
    socket.on('message', (data, isBinary) => this.handleFrame(data as Buffer, isBinary))
    socket.once('error', (error) => this.handleLoss(error))
    socket.once('close', () => this.handleLoss(new SpoolPeerConnectionError('disconnected')))
    return new Promise<void>((resolve, reject) => {
      this.readyWaiter = { resolve, reject }
    })
  }

  request<TResult>(
    method: string,
    params: unknown,
    options: { mutation?: boolean; timeoutMs?: number } = {}
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      this.sendRequest(method, params, {
        mutation: options.mutation === true,
        streaming: false,
        timeoutMs: options.timeoutMs ?? SPOOL_REQUEST_TIMEOUT_MS,
        resolve: resolve as (value: unknown) => void,
        reject
      })
    })
  }

  subscribe<TResult>(method: string, params: unknown, sink: SpoolSink<TResult>): SpoolSubscription {
    const requestId = this.sendRequest(method, params, {
      mutation: false,
      streaming: true,
      timeoutMs: SPOOL_REQUEST_TIMEOUT_MS,
      resolve: () => {},
      reject: (error) => sink.error(error),
      sink: sink as SpoolSink<unknown>
    })
    return {
      close: () => {
        const pending = requestId ? this.pending.get(requestId) : null
        if (requestId && pending) {
          this.sendSubscriptionCancellation(requestId)
          clearPendingTimeout(pending)
          this.pending.delete(requestId)
          try {
            pending.sink?.complete()
          } catch {
            this.handleLoss(new SpoolPeerConnectionError('protocol_error'))
          }
        }
      }
    }
  }

  subscribeState(listener: (state: SpoolConnectionState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  close(): void {
    if (this.state === 'closed') {
      return
    }
    this.state = 'closed'
    this.rejectAll(false)
    this.readyWaiter?.reject(new SpoolPeerConnectionError('disconnected'))
    this.readyWaiter = null
    this.sharedKey = null
    this.stopHeartbeat?.()
    this.stopHeartbeat = null
    this.socket?.terminate()
    this.socket = null
    this.connectionEpoch++
    this.publish({
      status: 'disconnected',
      connectionEpoch: this.connectionEpoch,
      reason: 'stopped'
    })
  }

  private sendRequest(
    method: string,
    params: unknown,
    request: Omit<SpoolPendingPeerRequest, 'timeout'> & { timeoutMs: number }
  ): string | null {
    if (this.state !== 'ready' || !this.socket || !this.sharedKey) {
      request.reject(new SpoolPeerConnectionError('disconnected'))
      return null
    }
    const requestId = randomUUID()
    const timeout = setTimeout(() => {
      const pending = this.pending.get(requestId)
      if (!pending) {
        return
      }
      this.pending.delete(requestId)
      pending.reject(new SpoolPeerConnectionError(pending.mutation ? 'outcome_unknown' : 'timeout'))
    }, request.timeoutMs)
    this.pending.set(requestId, { ...request, timeout })
    this.socket.send(encrypt(JSON.stringify({ id: requestId, method, params }), this.sharedKey))
    return requestId
  }

  private handleFrame(data: Buffer, isBinary: boolean): void {
    const sharedKey = this.sharedKey
    if (!sharedKey) {
      return
    }
    if (isBinary) {
      // Why: the owner cannot introduce an unchecked terminal multiplex path
      // into a connection whose V1 contract is the explicit JSON registry.
      this.handleLoss(new SpoolPeerConnectionError('protocol_error'))
      return
    }
    const frame = data.toString()
    if (this.state === 'awaiting-ready') {
      if (!isSpoolReadyFrame(frame)) {
        this.handleLoss(new SpoolPeerConnectionError('protocol_error'))
        return
      }
      this.state = 'awaiting-authenticated'
      this.socket?.send(
        encrypt(
          JSON.stringify({ type: 'e2ee_auth', spoolTicket: this.admission.response.ticket }),
          sharedKey
        )
      )
      return
    }
    const plaintext = decrypt(frame, sharedKey)
    if (!plaintext) {
      this.handleLoss(new SpoolPeerConnectionError('protocol_error'))
      return
    }
    if (this.state === 'awaiting-authenticated') {
      if (!isSpoolAuthenticatedFrame(plaintext)) {
        this.handleLoss(new SpoolPeerConnectionError('protocol_error'))
        return
      }
      this.state = 'ready'
      this.readyWaiter?.resolve()
      this.readyWaiter = null
      this.publish({
        status: 'connected',
        connectionEpoch: this.connectionEpoch,
        ownerRuntimeId: this.admission.response.ownerRuntimeId
      })
      return
    }
    dispatchSpoolPeerResponse({
      plaintext,
      ownerRuntimeId: this.admission.response.ownerRuntimeId,
      pending: this.pending,
      onOwnerMismatch: () => this.handleLoss(new SpoolPeerConnectionError('protocol_error')),
      onProtocolViolation: () => this.handleLoss(new SpoolPeerConnectionError('protocol_error'))
    })
  }

  private sendSubscriptionCancellation(requestId: string): void {
    if (this.state !== 'ready' || !this.socket || !this.sharedKey) {
      return
    }
    this.socket.send(
      encrypt(
        JSON.stringify({
          id: randomUUID(),
          method: SPOOL_CANCEL_SUBSCRIPTION_METHOD,
          params: { requestId }
        }),
        this.sharedKey
      )
    )
  }

  private handleLoss(error: Error): void {
    if (this.state === 'closed') {
      return
    }
    const socket = this.socket
    this.state = 'closed'
    this.readyWaiter?.reject(error)
    this.readyWaiter = null
    this.rejectAll(true)
    this.sharedKey = null
    this.stopHeartbeat?.()
    this.stopHeartbeat = null
    this.socket = null
    // Why: owner-side grants are scoped to the physical socket, so every local
    // protocol failure must tear it down instead of only changing client state.
    socket?.terminate()
    this.connectionEpoch++
    this.publish({
      status: 'disconnected',
      connectionEpoch: this.connectionEpoch,
      reason: 'closed'
    })
  }

  private rejectAll(outcomeMayBeUnknown: boolean): void {
    for (const [id, pending] of this.pending) {
      clearPendingTimeout(pending)
      this.pending.delete(id)
      const code = outcomeMayBeUnknown && pending.mutation ? 'outcome_unknown' : 'disconnected'
      const error = new SpoolPeerConnectionError(code)
      try {
        pending.reject(error)
      } catch {
        // A renderer-facing sink must not escape into the WebSocket event callback.
      }
    }
  }

  private publish(state: SpoolConnectionState): void {
    for (const listener of this.stateListeners) {
      listener(state)
    }
  }
}
