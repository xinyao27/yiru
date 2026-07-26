import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import type { CoworkingConnectionState } from '../../shared/coworking/wire-contract'
import {
  COWORKING_CONNECT_PATH,
  COWORKING_INGRESS_PORT,
  COWORKING_MAX_ENCRYPTED_FRAME_BYTES
} from '../../shared/coworking/wire-contract'
import { decrypt, deriveSharedKey, encrypt, publicKeyFromBase64 } from '../../shared/e2ee-crypto'
import {
  CoworkingPeerConnectionError,
  type CoworkingSink,
  type CoworkingSubscription
} from './peer-connection-contract'
import {
  COWORKING_CONNECT_TIMEOUT_MS,
  COWORKING_REQUEST_TIMEOUT_MS,
  type CoworkingPeerState
} from './peer-connection-policy'
import {
  formatCoworkingPeerAddress,
  isCoworkingAuthenticatedFrame,
  isCoworkingReadyFrame
} from './peer-handshake'
import {
  abortCoworkingPendingPeerRequest,
  sendCoworkingPeerCancellation
} from './peer-request-cancellation'
import { rejectCoworkingPendingPeerRequests } from './peer-request-rejection'
import {
  clearPendingRequest,
  clearPendingTimeout,
  dispatchCoworkingPeerResponse,
  type CoworkingPendingPeerRequest
} from './peer-response-dispatch'
import { CoworkingPeerStatePublisher } from './peer-state-publisher'
import type { CoworkingPeerAdmission } from './probe-client'
import {
  COWORKING_CANCEL_REQUEST_METHOD,
  COWORKING_CANCEL_SUBSCRIPTION_METHOD
} from './rpc-cancellation'
import { startCoworkingWebSocketHeartbeat } from './websocket-heartbeat'

export {
  CoworkingPeerConnectionError,
  type CoworkingSink,
  type CoworkingSubscription
} from './peer-connection-contract'

export class CoworkingPeerConnection {
  private socket: WebSocket | null = null
  private sharedKey: Uint8Array | null = null
  private state: CoworkingPeerState = 'idle'
  private connectionEpoch = 0
  private readonly pending = new Map<string, CoworkingPendingPeerRequest>()
  private readonly states = new CoworkingPeerStatePublisher()
  private readyWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null
  private stopHeartbeat: (() => void) | null = null

  constructor(private readonly admission: CoworkingPeerAdmission) {}

  connect(): Promise<void> {
    if (this.state !== 'idle') {
      return this.state === 'ready'
        ? Promise.resolve()
        : Promise.reject(new CoworkingPeerConnectionError('protocol_error'))
    }
    this.states.publish({ status: 'connecting', connectionEpoch: this.connectionEpoch })
    this.state = 'awaiting-ready'
    const endpoint = `ws://${formatCoworkingPeerAddress(this.admission.address)}:${COWORKING_INGRESS_PORT}${COWORKING_CONNECT_PATH}`
    const socket = new WebSocket(endpoint, {
      followRedirects: false,
      handshakeTimeout: COWORKING_CONNECT_TIMEOUT_MS,
      maxPayload: COWORKING_MAX_ENCRYPTED_FRAME_BYTES,
      perMessageDeflate: false
    })
    this.socket = socket
    this.sharedKey = deriveSharedKey(
      this.admission.clientSecretKey,
      publicKeyFromBase64(this.admission.response.ownerPublicKeyB64)
    )
    socket.on('open', () => {
      this.stopHeartbeat = startCoworkingWebSocketHeartbeat(socket, () =>
        this.handleLoss(new CoworkingPeerConnectionError('disconnected'))
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
    socket.once('close', () => this.handleLoss(new CoworkingPeerConnectionError('disconnected')))
    return new Promise<void>((resolve, reject) => {
      this.readyWaiter = { resolve, reject }
    })
  }

  request<TResult>(
    method: string,
    params: unknown,
    options: { mutation?: boolean; timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<TResult> {
    options.signal?.throwIfAborted()
    return new Promise<TResult>((resolve, reject) => {
      this.sendRequest(method, params, {
        mutation: options.mutation === true,
        streaming: false,
        timeoutMs: options.timeoutMs ?? COWORKING_REQUEST_TIMEOUT_MS,
        resolve: resolve as (value: unknown) => void,
        reject,
        signal: options.signal
      })
    })
  }

  subscribe<TResult>(
    method: string,
    params: unknown,
    sink: CoworkingSink<TResult>
  ): CoworkingSubscription {
    const requestId = this.sendRequest(method, params, {
      mutation: false,
      streaming: true,
      timeoutMs: COWORKING_REQUEST_TIMEOUT_MS,
      resolve: () => {},
      reject: (error) => sink.error(error),
      sink: sink as CoworkingSink<unknown>
    })
    return {
      close: () => {
        const pending = requestId ? this.pending.get(requestId) : null
        if (requestId && pending) {
          this.sendCancellation(COWORKING_CANCEL_SUBSCRIPTION_METHOD, requestId)
          clearPendingTimeout(pending)
          this.pending.delete(requestId)
          try {
            pending.sink?.complete()
          } catch {
            this.handleLoss(new CoworkingPeerConnectionError('protocol_error'))
          }
        }
      }
    }
  }

  subscribeState(listener: (state: CoworkingConnectionState) => void): () => void {
    return this.states.subscribe(listener)
  }

  close(): void {
    if (this.state === 'closed') {
      return
    }
    this.state = 'closed'
    rejectCoworkingPendingPeerRequests(this.pending, false)
    this.readyWaiter?.reject(new CoworkingPeerConnectionError('disconnected'))
    this.readyWaiter = null
    this.sharedKey = null
    this.stopHeartbeat?.()
    this.stopHeartbeat = null
    this.socket?.terminate()
    this.socket = null
    this.connectionEpoch++
    this.states.publish({
      status: 'disconnected',
      connectionEpoch: this.connectionEpoch,
      reason: 'stopped'
    })
  }

  private sendRequest(
    method: string,
    params: unknown,
    request: Omit<CoworkingPendingPeerRequest, 'timeout'> & { timeoutMs: number }
  ): string | null {
    if (this.state !== 'ready' || !this.socket || !this.sharedKey) {
      request.reject(new CoworkingPeerConnectionError('disconnected'))
      return null
    }
    const requestId = randomUUID()
    const timeout = setTimeout(() => {
      const pending = this.pending.get(requestId)
      if (!pending) {
        return
      }
      this.pending.delete(requestId)
      clearPendingRequest(pending)
      if (!pending.mutation) {
        this.sendCancellation(
          pending.streaming
            ? COWORKING_CANCEL_SUBSCRIPTION_METHOD
            : COWORKING_CANCEL_REQUEST_METHOD,
          requestId
        )
      }
      pending.reject(
        new CoworkingPeerConnectionError(pending.mutation ? 'outcome_unknown' : 'timeout')
      )
    }, request.timeoutMs)
    const { timeoutMs: _timeoutMs, ...requestWithoutTimeout } = request
    const pending: CoworkingPendingPeerRequest = { ...requestWithoutTimeout, timeout }
    pending.abortListener = () =>
      abortCoworkingPendingPeerRequest({
        pendingRequests: this.pending,
        requestId,
        pending,
        sendCancellation: () => this.sendCancellation(COWORKING_CANCEL_REQUEST_METHOD, requestId)
      })
    this.pending.set(requestId, pending)
    request.signal?.addEventListener('abort', pending.abortListener, { once: true })
    if (request.signal?.aborted) {
      pending.abortListener()
      return requestId
    }
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
      this.handleLoss(new CoworkingPeerConnectionError('protocol_error'))
      return
    }
    const frame = data.toString()
    if (this.state === 'awaiting-ready') {
      if (!isCoworkingReadyFrame(frame)) {
        this.handleLoss(new CoworkingPeerConnectionError('protocol_error'))
        return
      }
      this.state = 'awaiting-authenticated'
      this.socket?.send(
        encrypt(
          JSON.stringify({ type: 'e2ee_auth', coworkingTicket: this.admission.response.ticket }),
          sharedKey
        )
      )
      return
    }
    const plaintext = decrypt(frame, sharedKey)
    if (!plaintext) {
      this.handleLoss(new CoworkingPeerConnectionError('protocol_error'))
      return
    }
    if (this.state === 'awaiting-authenticated') {
      if (!isCoworkingAuthenticatedFrame(plaintext)) {
        this.handleLoss(new CoworkingPeerConnectionError('protocol_error'))
        return
      }
      this.state = 'ready'
      this.readyWaiter?.resolve()
      this.readyWaiter = null
      this.states.publish({
        status: 'connected',
        connectionEpoch: this.connectionEpoch,
        ownerRuntimeId: this.admission.response.ownerRuntimeId
      })
      return
    }
    dispatchCoworkingPeerResponse({
      plaintext,
      ownerRuntimeId: this.admission.response.ownerRuntimeId,
      pending: this.pending,
      onOwnerMismatch: () => this.handleLoss(new CoworkingPeerConnectionError('protocol_error')),
      onProtocolViolation: () => this.handleLoss(new CoworkingPeerConnectionError('protocol_error'))
    })
  }

  private sendCancellation(method: string, requestId: string): void {
    sendCoworkingPeerCancellation({
      socket: this.state === 'ready' ? this.socket : null,
      sharedKey: this.sharedKey,
      method,
      requestId
    })
  }

  private handleLoss(error: Error): void {
    if (this.state === 'closed') {
      return
    }
    const socket = this.socket
    this.state = 'closed'
    this.readyWaiter?.reject(error)
    this.readyWaiter = null
    rejectCoworkingPendingPeerRequests(this.pending, true)
    this.sharedKey = null
    this.stopHeartbeat?.()
    this.stopHeartbeat = null
    this.socket = null
    // Why: owner-side grants are scoped to the physical socket, so every local
    // protocol failure must tear it down instead of only changing client state.
    socket?.terminate()
    this.connectionEpoch++
    this.states.publish({
      status: 'disconnected',
      connectionEpoch: this.connectionEpoch,
      reason: 'closed'
    })
  }
}
