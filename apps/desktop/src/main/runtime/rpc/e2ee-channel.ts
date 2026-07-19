// Why: the E2EE channel sits between the WebSocket transport and the RPC handler.
// It owns the handshake state machine and transparent encrypt/decrypt so the RPC
// handler only sees plaintext JSON, identical to the Unix socket path.
import type { WebSocket } from 'ws'

import type { AuthenticatedRpcPrincipal } from '../../../shared/rpc-principal'
import {
  E2EEChannelAuthentication,
  freezeAuthenticatedRpcPrincipal,
  type E2EEAuthenticatedDevice,
  type E2EEChannelAuthenticationOptions
} from './e2ee-channel-authentication'
import { E2EEChannelOutbound } from './e2ee-channel-outbound'
import { deriveSharedKey, decrypt, decryptBytes } from './e2ee-crypto'
import { handleDesktopMobileE2EEV2Inbound } from './mobile-e2ee-v2-desktop-inbound'
import {
  DesktopMobileE2EEV2Session,
  type DesktopMobileE2EEV2Context
} from './mobile-e2ee-v2-desktop-session'

export type {
  E2EEAuthenticatedDevice,
  E2EEAuthenticationContext,
  E2EEAuthenticationResult
} from './e2ee-channel-authentication'

type ChannelState = 'awaiting_hello' | 'awaiting_auth' | 'ready'

const HANDSHAKE_TIMEOUT_MS = 10_000
const MAX_CONSECUTIVE_DECRYPT_FAILURES = 5

type E2EEChannelCommonOptions = {
  serverSecretKey: Uint8Array
  onError: (code: number, reason: string) => void
  transportContext?: DesktopMobileE2EEV2Context
  requireV2?: boolean
}

export type E2EEChannelOptions = E2EEChannelCommonOptions &
  E2EEChannelAuthenticationOptions & {
    maxTextReplyQueuedBytesPerGroup?: number
  }

export class E2EEChannel {
  private state: ChannelState = 'awaiting_hello'
  private sharedKey: Uint8Array | null = null
  private consecutiveFailures = 0
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  private readonly ws: WebSocket
  private readonly serverSecretKey: Uint8Array
  private readonly authentication: E2EEChannelAuthentication
  private readonly outbound: E2EEChannelOutbound
  private readonly onError: (code: number, reason: string) => void
  private readonly transportContext: DesktopMobileE2EEV2Context
  private readonly requireV2: boolean
  private v2Session: DesktopMobileE2EEV2Session | null = null
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

  deviceToken: string | null = null
  authenticatedDevice: E2EEAuthenticatedDevice | null = null
  private clientPublicKeyB64: string | null = null
  private authenticatedPrincipal: AuthenticatedRpcPrincipal | null = null

  get principal(): AuthenticatedRpcPrincipal | null {
    return this.authenticatedPrincipal
  }

  constructor(ws: WebSocket, options: E2EEChannelOptions) {
    this.ws = ws
    this.serverSecretKey = options.serverSecretKey
    this.authentication = new E2EEChannelAuthentication(options)
    this.onError = options.onError
    this.transportContext = options.transportContext ?? { transport: 'direct' }
    this.requireV2 = options.requireV2 ?? false
    this.outbound = new E2EEChannelOutbound({
      ws,
      onError: options.onError,
      getState: () => ({
        ready: this.state === 'ready',
        sharedKey: this.sharedKey,
        v2Session: this.v2Session
      }),
      ...(options.maxTextReplyQueuedBytesPerGroup === undefined
        ? {}
        : { maxTextReplyQueuedBytesPerGroup: options.maxTextReplyQueuedBytesPerGroup })
    })

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

    if (this.v2Session) {
      this.handleV2RawMessage(raw)
      return
    }
    const sharedKey = this.sharedKey
    if (!sharedKey) {
      return
    }

    if (typeof raw !== 'string') {
      const plaintextBytes = decryptBytes(raw, sharedKey)
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

    const plaintext = decrypt(raw, sharedKey)
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
    let hello: Record<string, unknown>
    try {
      hello = JSON.parse(raw) as Record<string, unknown>
    } catch {
      this.onError(4001, 'Invalid handshake message')
      return
    }

    if (hello.type === 'e2ee_hello' && hello.v === 2) {
      const session = DesktopMobileE2EEV2Session.create({
        hello,
        serverSecretKey: this.serverSecretKey,
        expectedContext: this.transportContext
      })
      if (!session) {
        this.onError(4001, 'Invalid e2ee_hello v2')
        return
      }
      this.v2Session = session
      this.state = 'awaiting_auth'
      if (this.ws.readyState === this.ws.OPEN) {
        this.ws.send(JSON.stringify(session.ready))
      }
      return
    }

    if (this.requireV2) {
      this.onError(4001, 'E2EE v2 required')
      return
    }
    if (hello.type !== 'e2ee_hello' || typeof hello.publicKeyB64 !== 'string') {
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

    const authentication = this.authentication.authenticate(
      authFrame,
      { clientPublicKeyB64: this.clientPublicKeyB64 ?? '' },
      this.v2Session
    )
    if (authentication === 'invalid') {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'bad_auth' } })
      this.onError(4001, 'Invalid e2ee_auth')
      return
    }
    if (!authentication) {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'unauthorized' } })
      this.onError(4001, 'Unauthorized')
      return
    }

    this.authenticatedDevice = authentication.device
    this.authenticatedPrincipal = freezeAuthenticatedRpcPrincipal(authentication.identity.principal)
    this.deviceToken = authentication.identity.legacyDeviceToken ?? null
    this.state = 'ready'

    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }

    // Why: transport-bound identity checks must complete before the peer sees
    // authentication success; relay sockets additionally bind this context to
    // their immutable relayDeviceId in the resolver.
    try {
      this.authentication.notifyReady(this, authentication)
    } catch {
      // Why: a composition failure after authentication must close this exact
      // channel instead of escaping the WebSocket callback with a live socket.
      this.onError(1011, 'Encrypted channel setup failed')
      return
    }
    this.sendEncryptedControl(
      this.v2Session
        ? {
            type: 'e2ee_authenticated',
            v: 2,
            transcriptHashB64: this.v2Session.transcriptHashB64
          }
        : { type: 'e2ee_authenticated' }
    )
  }

  private handleV2RawMessage(raw: string | Uint8Array<ArrayBufferLike>): void {
    handleDesktopMobileE2EEV2Inbound({
      session: this.v2Session!,
      raw,
      awaitingAuth: this.state === 'awaiting_auth',
      onDecryptFailure: () => this.trackDecryptFailure(),
      onDecryptSuccess: () => (this.consecutiveFailures = 0),
      onAuth: (plaintext) => this.handleAuth(plaintext),
      onBinary: (plaintext) => this.binaryMessageHandler?.(plaintext),
      onText: (plaintext) =>
        this.messageHandler?.(
          plaintext,
          (response) => this.outbound.sendV2({ kind: 'text', plaintext: response }),
          (response) => (this.outbound.sendV2({ kind: 'binary', plaintext: response }), true)
        ),
      onProtocolError: () => this.onError(4001, 'Invalid binary message before authentication')
    })
  }

  sendText(plaintext: string, groupKey?: string): boolean {
    return this.outbound.sendText(plaintext, groupKey)
  }

  sendBinary(plaintext: Uint8Array<ArrayBufferLike>): boolean {
    return this.outbound.sendBinary(plaintext)
  }

  private sendEncryptedControl(message: unknown): void {
    this.outbound.sendControl(message)
  }

  destroy(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    this.sharedKey = null
    this.clientPublicKeyB64 = null
    this.authenticatedPrincipal = null
    this.deviceToken = null
    this.authenticatedDevice = null
    this.v2Session = null
    this.messageHandler = null
    this.binaryMessageHandler = null
    this.outbound.destroy()
  }
}
