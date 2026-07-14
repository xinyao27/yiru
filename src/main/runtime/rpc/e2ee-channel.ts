// Why: the E2EE channel sits between the WebSocket transport and the RPC handler.
// It owns the handshake state machine and transparent encrypt/decrypt so the RPC
// handler only sees plaintext JSON, identical to the Unix socket path.
import type { WebSocket } from 'ws'
import type { AuthenticatedRpcPrincipal } from '../../../shared/rpc-principal'
import { deriveSharedKey, encrypt, decrypt, encryptBytes, decryptBytes } from './e2ee-crypto'
import {
  createWsOutboundBackpressureQueue,
  type WsOutboundBackpressureQueue
} from '../../../shared/ws-outbound-backpressure-queue'

type ChannelState = 'awaiting_hello' | 'awaiting_auth' | 'ready'

const HANDSHAKE_TIMEOUT_MS = 10_000
const MAX_CONSECUTIVE_DECRYPT_FAILURES = 5
const MAX_BINARY_BUFFERED_AMOUNT = 8 * 1024 * 1024

type E2EEHello = {
  type: 'e2ee_hello'
  publicKeyB64: string
}

type E2EEAuth = {
  type: 'e2ee_auth'
  deviceToken: string
}

export type E2EEAuthenticationResult = {
  principal: AuthenticatedRpcPrincipal
  legacyDeviceToken?: string
}

export type E2EEAuthenticationContext = {
  clientPublicKeyB64: string
}

export type E2EEChannelOptions = {
  serverSecretKey: Uint8Array
  validateToken?: (token: string) => boolean
  authenticate?: (
    authFrame: unknown,
    context: E2EEAuthenticationContext
  ) => E2EEAuthenticationResult | null
  onReady: (channel: E2EEChannel) => void
  onError: (code: number, reason: string) => void
}

export class E2EEChannel {
  private state: ChannelState = 'awaiting_hello'
  private sharedKey: Uint8Array | null = null
  private consecutiveFailures = 0
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  private readonly ws: WebSocket
  private readonly serverSecretKey: Uint8Array
  private readonly validateToken: ((token: string) => boolean) | undefined
  private readonly authenticate:
    | ((authFrame: unknown, context: E2EEAuthenticationContext) => E2EEAuthenticationResult | null)
    | undefined
  private readonly onReady: (channel: E2EEChannel) => void
  private readonly onError: (code: number, reason: string) => void
  // Why: the RPC handler is set after the channel is ready, so the channel
  // can forward decrypted messages. Kept as a callback rather than constructor
  // param because the handler needs the encrypt function for replies.
  private messageHandler:
    | ((
        plaintext: string,
        encryptedReply: (response: string) => void,
        encryptedBinaryReply: (response: Uint8Array<ArrayBufferLike>) => boolean | void
      ) => void)
    | null = null
  private binaryMessageHandler: ((plaintext: Uint8Array<ArrayBufferLike>) => void) | null = null
  // Why: the streaming JSON reply path (e.g. legacy terminal.subscribe) has no
  // seq/resync, so it must never drop frames under backpressure. Hold text
  // replies in order while bufferedAmount is over the cap and drain as it
  // clears; only a wedged link (hard cap) closes the socket for a clean resync.
  private textReplyQueue: WsOutboundBackpressureQueue<string> | null = null

  private clientPublicKeyB64: string | null = null
  private authenticatedPrincipal: AuthenticatedRpcPrincipal | null = null
  private legacyDeviceToken: string | null = null

  get principal(): AuthenticatedRpcPrincipal | null {
    return this.authenticatedPrincipal
  }

  get deviceToken(): string | null {
    return this.legacyDeviceToken
  }

  constructor(ws: WebSocket, options: E2EEChannelOptions) {
    this.ws = ws
    this.serverSecretKey = options.serverSecretKey
    this.validateToken = options.validateToken
    this.authenticate = options.authenticate
    this.onReady = options.onReady
    this.onError = options.onError

    if (!this.validateToken && !this.authenticate) {
      throw new Error('E2EE channel requires an authenticator')
    }

    this.handshakeTimer = setTimeout(() => {
      this.onError(4002, 'E2EE handshake timeout')
    }, HANDSHAKE_TIMEOUT_MS)
  }

  onMessage(
    handler: (
      plaintext: string,
      encryptedReply: (response: string) => void,
      encryptedBinaryReply: (response: Uint8Array<ArrayBufferLike>) => boolean | void
    ) => void
  ): void {
    this.messageHandler = handler
  }

  onBinaryMessage(handler: (plaintext: Uint8Array<ArrayBufferLike>) => void): void {
    this.binaryMessageHandler = handler
  }

  handleRawMessage(raw: string | Uint8Array<ArrayBufferLike>): void {
    if (this.state === 'awaiting_hello') {
      if (typeof raw !== 'string') {
        this.onError(4001, 'Invalid handshake message')
        return
      }
      this.handleHello(raw)
      return
    }

    if (!this.sharedKey) {
      return
    }

    if (typeof raw !== 'string') {
      const plaintextBytes = decryptBytes(raw, this.sharedKey)
      if (plaintextBytes === null) {
        this.trackDecryptFailure()
        return
      }
      this.consecutiveFailures = 0
      if (this.state !== 'ready') {
        this.onError(4001, 'Invalid binary message before authentication')
        return
      }
      this.binaryMessageHandler?.(plaintextBytes)
      return
    }

    const plaintext = decrypt(raw, this.sharedKey)
    if (plaintext === null) {
      this.trackDecryptFailure()
      return
    }

    this.consecutiveFailures = 0
    if (this.state === 'awaiting_auth') {
      this.handleAuth(plaintext)
      return
    }

    // Why: streaming RPC handlers (e.g. terminal.subscribe) retain this
    // closure and may fire emits long after the inbound message handled
    // here. If destroy() runs in between (mobile disconnect, handshake
    // failure) sharedKey becomes null and tweetnacl throws "unexpected
    // type, use Uint8Array" from inside nacl.box.after. Guard both the
    // socket state AND the key so late emits become silent no-ops.
    const encryptedReply = (response: string) => {
      this.sendText(response)
    }
    const encryptedBinaryReply = (response: Uint8Array<ArrayBufferLike>): boolean => {
      return this.sendBinary(response)
    }
    this.messageHandler?.(plaintext, encryptedReply, encryptedBinaryReply)
  }

  private trackDecryptFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_DECRYPT_FAILURES) {
      this.onError(4003, 'Too many decryption failures')
    }
  }

  private handleHello(raw: string): void {
    let hello: E2EEHello
    try {
      hello = JSON.parse(raw) as E2EEHello
    } catch {
      this.onError(4001, 'Invalid handshake message')
      return
    }

    if (hello.type !== 'e2ee_hello' || !hello.publicKeyB64) {
      this.onError(4001, 'Invalid e2ee_hello')
      return
    }

    // Why: derive the shared key from our secret + client's public key.
    // Both sides compute the same shared secret via ECDH.
    const clientPublicKey = Uint8Array.from(Buffer.from(hello.publicKeyB64, 'base64'))
    if (clientPublicKey.length !== 32) {
      this.onError(4001, 'Invalid public key')
      return
    }

    this.sharedKey = deriveSharedKey(this.serverSecretKey, clientPublicKey)
    this.clientPublicKeyB64 = hello.publicKeyB64
    this.state = 'awaiting_auth'

    // Why: send e2ee_ready as plaintext — the client needs it to know the
    // key exchange succeeded before it can send encrypted authentication.
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify({ type: 'e2ee_ready' }))
    }
  }

  private handleAuth(plaintext: string): void {
    let authFrame: unknown
    try {
      authFrame = JSON.parse(plaintext)
    } catch {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'bad_auth' } })
      this.onError(4001, 'Invalid e2ee_auth')
      return
    }

    const identity = this.authenticate
      ? this.authenticate(authFrame, { clientPublicKeyB64: this.clientPublicKeyB64 ?? '' })
      : this.authenticateLegacyDevice(authFrame)
    if (identity === 'invalid') {
      return
    }
    if (!identity) {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'unauthorized' } })
      this.onError(4001, 'Unauthorized')
      return
    }

    this.authenticatedPrincipal = freezePrincipal(identity.principal)
    this.legacyDeviceToken = identity.legacyDeviceToken ?? null
    this.state = 'ready'

    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }

    this.sendEncryptedControl({ type: 'e2ee_authenticated' })
    try {
      this.onReady(this)
    } catch {
      // Why: a composition failure after authentication must close this exact
      // channel instead of escaping the WebSocket callback with a live socket.
      this.onError(1011, 'Encrypted channel setup failed')
    }
  }

  private authenticateLegacyDevice(
    authFrame: unknown
  ): E2EEAuthenticationResult | 'invalid' | null {
    const auth = authFrame as Partial<E2EEAuth> | null
    if (!auth || auth.type !== 'e2ee_auth' || !auth.deviceToken) {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'bad_auth' } })
      this.onError(4001, 'Invalid e2ee_auth')
      return 'invalid'
    }
    if (!this.validateToken?.(auth.deviceToken)) {
      return null
    }
    return {
      principal: {
        kind: 'paired-device',
        deviceId: auth.deviceToken,
        scope: 'mobile'
      },
      legacyDeviceToken: auth.deviceToken
    }
  }

  private ensureTextReplyQueue(): WsOutboundBackpressureQueue<string> {
    if (!this.textReplyQueue) {
      this.textReplyQueue = createWsOutboundBackpressureQueue<string>({
        send: (frame) => this.ws.send(frame),
        // Encrypted replies are base64 ASCII strings, so length === byte count.
        byteLengthOf: (frame) => frame.length,
        getBufferedAmount: () => this.ws.bufferedAmount,
        isWritable: () => Boolean(this.sharedKey) && this.ws.readyState === this.ws.OPEN,
        // 1013 (Try Again Later): the link is wedged; drop the channel so the
        // client reconnects and replays a full snapshot instead of unbounded RSS.
        onOverflow: () => this.onError(1013, 'Outbound reply buffer overflow')
      })
    }
    return this.textReplyQueue
  }

  sendText(plaintext: string): boolean {
    if (!this.sharedKey || this.state !== 'ready' || this.ws.readyState !== this.ws.OPEN) {
      return false
    }
    this.ensureTextReplyQueue().enqueue(encrypt(plaintext, this.sharedKey))
    return true
  }

  sendBinary(plaintext: Uint8Array<ArrayBufferLike>): boolean {
    if (!this.sharedKey || this.state !== 'ready' || this.ws.readyState !== this.ws.OPEN) {
      return false
    }
    if (this.ws.bufferedAmount > MAX_BINARY_BUFFERED_AMOUNT) {
      return false
    }
    this.ws.send(Buffer.from(encryptBytes(plaintext, this.sharedKey)), { binary: true })
    return true
  }

  private sendEncryptedControl(message: unknown): void {
    if (this.ws.readyState === this.ws.OPEN && this.sharedKey) {
      this.ws.send(encrypt(JSON.stringify(message), this.sharedKey))
    }
  }

  destroy(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    this.sharedKey = null
    this.clientPublicKeyB64 = null
    this.authenticatedPrincipal = null
    this.legacyDeviceToken = null
    this.messageHandler = null
    this.binaryMessageHandler = null
    this.textReplyQueue?.dispose()
    this.textReplyQueue = null
  }
}

function freezePrincipal(principal: AuthenticatedRpcPrincipal): AuthenticatedRpcPrincipal {
  if (principal.kind === 'spool') {
    return Object.freeze({
      ...principal,
      tailnet: Object.freeze({ ...principal.tailnet })
    })
  }
  return Object.freeze({ ...principal })
}
