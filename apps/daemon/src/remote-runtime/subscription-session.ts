import { Buffer } from 'node:buffer'

import { createWsOutboundBackpressureQueue } from '@yiru/runtime-protocol/mobile/outbound-backpressure'
import { encodeRuntimeOrpcSideChannelBinaryFrame } from '@yiru/runtime-protocol/orpc-peer-frame'
import type { PairingOffer } from '@yiru/runtime-protocol/workbench/pairing'
import { RemoteRuntimeClientError } from '@yiru/runtime-protocol/workbench/remote-runtime/client-error'
import type { DedicatedRemoteRuntimeOrpcPeer } from '@yiru/runtime-protocol/workbench/remote-runtime/dedicated-orpc-peer'

import {
  deriveSharedKey,
  encrypt,
  encryptBytes,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from '../e2ee-crypto'
import { formatRemoteRuntimeCloseMessage, type HandshakeState } from './client-socket'
import type { RemoteRuntimeSocketLivenessMonitor } from './socket-liveness'
import type {
  RemoteRuntimeSubscription,
  RemoteRuntimeSubscriptionCallbacks
} from './subscription-types'

type SubscriptionSessionOptions<TResult> = {
  pairing: PairingOffer
  method: string
  params: unknown
  timeoutMs: number
  requestId: string
  callbacks: RemoteRuntimeSubscriptionCallbacks<TResult>
  resolve: (subscription: RemoteRuntimeSubscription) => void
  reject: (error: RemoteRuntimeClientError) => void
}

export class RemoteRuntimeSubscriptionSession<TResult> {
  readonly pairing: PairingOffer
  readonly method: string
  readonly params: unknown
  readonly requestId: string
  readonly callbacks: RemoteRuntimeSubscriptionCallbacks<TResult>
  readonly streamAbort = new AbortController()
  readonly sharedKey: ReturnType<typeof deriveSharedKey>
  state: HandshakeState = 'awaiting_ready'
  dedicatedOrpcPeer: DedicatedRemoteRuntimeOrpcPeer | null = null

  private readonly keyPair = generateKeyPair()
  private readonly resolve: (subscription: RemoteRuntimeSubscription) => void
  private readonly reject: (error: RemoteRuntimeClientError) => void
  private readonly timeout: ReturnType<typeof setTimeout>
  private socket: WebSocket | null = null
  private detachSocketListeners: (() => void) | null = null
  private liveness: RemoteRuntimeSocketLivenessMonitor | null = null
  private sendQueue: ReturnType<typeof createWsOutboundBackpressureQueue<Buffer>> | null = null
  private settled = false
  private socketClosed = false
  private didNotifyClose = false

  constructor(options: SubscriptionSessionOptions<TResult>) {
    this.pairing = options.pairing
    this.method = options.method
    this.params = options.params
    this.requestId = options.requestId
    this.callbacks = options.callbacks
    this.resolve = options.resolve
    this.reject = options.reject
    this.sharedKey = deriveSharedKey(
      this.keyPair.secretKey,
      publicKeyFromBase64(options.pairing.publicKeyB64)
    )
    this.timeout = setTimeout(() => {
      this.fail(
        new RemoteRuntimeClientError(
          'runtime_timeout',
          'Timed out waiting for the runtime host subscription to start.'
        )
      )
    }, options.timeoutMs)
  }

  get ws(): WebSocket | null {
    return this.socket
  }

  get isSocketClosed(): boolean {
    return this.socketClosed
  }

  publicKeyB64(): string {
    return publicKeyToBase64(this.keyPair.publicKey)
  }

  setSocket(socket: WebSocket, detachListeners: () => void): void {
    this.socket = socket
    this.detachSocketListeners = detachListeners
  }

  setLiveness(liveness: RemoteRuntimeSocketLivenessMonitor): void {
    this.liveness = liveness
  }

  noteActivity(): void {
    this.liveness?.noteActivity()
  }

  setDedicatedOrpcPeer(peer: DedicatedRemoteRuntimeOrpcPeer): void {
    this.dedicatedOrpcPeer = peer
  }

  closeDedicatedOrpcSubscription(): void {
    // Why: oRPC encodes its abort frame asynchronously. Close the peer first so
    // it detaches the abort listener before the signal fires against a closed peer.
    this.dedicatedOrpcPeer?.close()
    this.streamAbort.abort()
  }

  notifyClose(): void {
    if (!this.didNotifyClose) {
      this.didNotifyClose = true
      this.callbacks.onClose?.()
    }
  }

  cleanupSocketListeners(): WebSocket | null {
    this.liveness?.stop()
    this.liveness = null
    this.sendQueue?.dispose()
    this.sendQueue = null
    const socket = this.socket
    if (!socket) {
      return null
    }
    this.detachSocketListeners?.()
    this.detachSocketListeners = null
    this.socket = null
    return socket
  }

  closeSocketAfterCleanup(): void {
    this.closeDedicatedOrpcSubscription()
    const socket = this.cleanupSocketListeners()
    try {
      socket?.close()
    } catch {
      // ignore best-effort close
    }
  }

  close(): void {
    this.closeDedicatedOrpcSubscription()
    try {
      this.socket?.close()
    } catch {
      // ignore best-effort close
    }
  }

  sendBinary(bytes: Uint8Array<ArrayBufferLike>): boolean {
    const socket = this.socket
    if (this.state !== 'ready' || !socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }
    // Why: terminal multiplex keeps the existing mobile secretbox framing and
    // key schedule; the terminal inner protocol never guesses a suite.
    this.ensureSendQueue(socket).enqueue(Buffer.from(encryptBytes(bytes, this.sharedKey)))
    return true
  }

  sendOrpcText(frame: string): boolean {
    const socket = this.socket
    if (this.state !== 'ready' || !socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }
    socket.send(encrypt(frame, this.sharedKey))
    return true
  }

  succeed(): void {
    if (this.settled) {
      return
    }
    this.settled = true
    clearTimeout(this.timeout)
    this.resolve({
      requestId: this.requestId,
      close: () => this.close(),
      sendBinary: (bytes) =>
        this.sendBinary(
          this.method === 'terminal.multiplex'
            ? encodeRuntimeOrpcSideChannelBinaryFrame(this.requestId, bytes)
            : bytes
        )
    })
  }

  fail(error: RemoteRuntimeClientError): void {
    if (!this.settled) {
      this.settled = true
      clearTimeout(this.timeout)
      this.closeSocketAfterCleanup()
      this.reject(error)
      return
    }
    this.callbacks.onError(error)
    // Why: protocol failures terminate established subscriptions so the caller
    // can release callbacks and resubscribe from a fresh snapshot.
    this.closeSocketAfterCleanup()
    this.notifyClose()
  }

  handleSocketClose(code: number, reason: string): void {
    this.socketClosed = true
    this.closeDedicatedOrpcSubscription()
    clearTimeout(this.timeout)
    this.cleanupSocketListeners()
    if (!this.settled) {
      this.settled = true
      this.reject(
        new RemoteRuntimeClientError(
          'remote_runtime_unavailable',
          formatRemoteRuntimeCloseMessage(code, reason)
        )
      )
      return
    }
    this.notifyClose()
  }

  private ensureSendQueue(
    socket: WebSocket
  ): ReturnType<typeof createWsOutboundBackpressureQueue<Buffer>> {
    if (!this.sendQueue) {
      this.sendQueue = createWsOutboundBackpressureQueue<Buffer>({
        send: (frame) => socket.send(Uint8Array.from(frame)),
        byteLengthOf: (frame) => frame.byteLength,
        getBufferedAmount: () => socket.bufferedAmount,
        isWritable: () => socket.readyState === WebSocket.OPEN,
        onOverflow: () =>
          this.fail(
            new RemoteRuntimeClientError(
              'remote_runtime_unavailable',
              'Runtime host send buffer overflow; reconnecting.'
            )
          )
      })
    }
    return this.sendQueue
  }
}
