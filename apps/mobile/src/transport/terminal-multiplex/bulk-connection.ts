import { RPCLink } from '@orpc/client/message-port'
import {
  decodeRuntimeOrpcSideChannelBinaryFrame,
  encodeRuntimeOrpcSideChannelBinaryFrame,
  RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER,
  RUNTIME_ORPC_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'

import {
  decrypt,
  decryptBytes,
  deriveSharedKey,
  encrypt,
  encryptBytes,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from '../e2ee'
import { MobileRuntimeOrpcChannel } from '../runtime-orpc-channel'
import { websocketPayloadToUint8 } from '../websocket-payload-bytes'

const HANDSHAKE_TIMEOUT_MS = 5_000
const CONNECTION_CREDIT_BYTES = 16 * 1024 * 1024

export type MobileTerminalBulkConnection = {
  sendTerminalFrame: (frame: Uint8Array<ArrayBufferLike>) => boolean
  isOpen: () => boolean
  close: () => void
}

type OpenBulkConnectionOptions = {
  endpoint: string
  deviceToken: string
  serverPublicKeyB64: string
  bulkTicket: string
  requestId: string
  onCreated: (connection: MobileTerminalBulkConnection) => void
  onReady: () => void
  onBinary: (frame: Uint8Array<ArrayBufferLike>) => void
  onError: (error: Error) => void
  onClose: () => void
}

export function openMobileTerminalBulkConnection(options: OpenBulkConnectionOptions): void {
  const socket = new WebSocket(options.endpoint)
  const serverPublicKey = publicKeyFromBase64(options.serverPublicKeyB64)
  const abort = new AbortController()
  let sharedKey: Uint8Array | null = null
  let channel: MobileRuntimeOrpcChannel | null = null
  let handshakeTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  let authenticated = false
  let messageChain = Promise.resolve()

  const connection: MobileTerminalBulkConnection = {
    sendTerminalFrame(frame): boolean {
      return sendBinary(encodeRuntimeOrpcSideChannelBinaryFrame(options.requestId, frame))
    },
    isOpen: () => !closed && authenticated && socket.readyState === WebSocket.OPEN,
    close: () => close(false)
  }
  options.onCreated(connection)

  socket.onopen = () => {
    const ephemeral = generateKeyPair()
    sharedKey = deriveSharedKey(ephemeral.secretKey, serverPublicKey)
    socket.send(
      JSON.stringify({ type: 'e2ee_hello', publicKeyB64: publicKeyToBase64(ephemeral.publicKey) })
    )
    handshakeTimer = setTimeout(
      () => fail(new Error('Mobile terminal bulk E2EE handshake timed out.')),
      HANDSHAKE_TIMEOUT_MS
    )
  }

  socket.onmessage = (event) => {
    messageChain = messageChain.then(() => handleMessage(event.data)).catch(fail)
  }
  socket.onerror = () => fail(new Error('Mobile terminal bulk WebSocket failed.'))
  socket.onclose = () => close(true)

  function sendText(plaintext: string): boolean {
    if (!sharedKey || socket.readyState !== WebSocket.OPEN || closed) {
      return false
    }
    socket.send(encrypt(plaintext, sharedKey))
    return true
  }

  function sendBinary(plaintext: Uint8Array<ArrayBufferLike>): boolean {
    if (
      !sharedKey ||
      socket.readyState !== WebSocket.OPEN ||
      closed ||
      socket.bufferedAmount + plaintext.byteLength > CONNECTION_CREDIT_BYTES
    ) {
      if (socket.bufferedAmount + plaintext.byteLength > CONNECTION_CREDIT_BYTES) {
        fail(new Error('Mobile terminal bulk socket queue exceeded 16 MiB.'))
      }
      return false
    }
    socket.send(encryptBytes(new Uint8Array(plaintext), sharedKey))
    return true
  }

  async function handleMessage(rawData: unknown): Promise<void> {
    if (!sharedKey || closed) {
      return
    }
    if (!authenticated) {
      await handleHandshakeMessage(rawData)
      return
    }
    if (typeof rawData === 'string') {
      const plaintext = decrypt(rawData, sharedKey)
      if (plaintext === null || !channel?.receiveText(plaintext)) {
        fail(new Error('Mobile terminal bulk received an invalid encrypted text frame.'))
      }
      return
    }
    const encrypted = await websocketPayloadToUint8(rawData)
    const plaintext = encrypted ? decryptBytes(encrypted, sharedKey) : null
    if (!plaintext) {
      fail(new Error('Mobile terminal bulk binary authentication failed.'))
      return
    }
    if (channel?.receiveBinary(plaintext)) {
      return
    }
    const sideChannel = decodeRuntimeOrpcSideChannelBinaryFrame(plaintext)
    if (!sideChannel || sideChannel.requestId !== options.requestId) {
      fail(new Error('Mobile terminal bulk received an invalid side-channel frame.'))
      return
    }
    options.onBinary(sideChannel.payload)
  }

  async function handleHandshakeMessage(rawData: unknown): Promise<void> {
    if (typeof rawData !== 'string' || !sharedKey) {
      fail(new Error('Mobile terminal bulk received an invalid handshake frame.'))
      return
    }

    // Why: the runtime sends e2ee_ready in plaintext before either side can
    // authenticate encrypted frames; all later handshake messages are sealed.
    try {
      const message: unknown = JSON.parse(rawData)
      if (isMessageType(message, 'e2ee_ready')) {
        sendText(JSON.stringify({ type: 'e2ee_auth', deviceToken: options.deviceToken }))
        return
      }
    } catch {
      // Encrypted handshake responses are not JSON until opened below.
    }

    const plaintext = decrypt(rawData, sharedKey)
    if (!plaintext) {
      fail(new Error('Mobile terminal bulk received an invalid handshake response.'))
      return
    }
    const message: unknown = JSON.parse(plaintext)
    if (!isMessageType(message, 'e2ee_authenticated')) {
      fail(new Error('Mobile terminal bulk authentication was rejected.'))
      return
    }
    authenticated = true
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    channel = new MobileRuntimeOrpcChannel({ sendText, sendBinary })
    const link = new RPCLink<Record<never, never>>({
      port: channel,
      headers: {
        [RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER]: '1',
        [RUNTIME_ORPC_REQUEST_ID_HEADER]: options.requestId
      }
    })
    void consumeMultiplex(link)
  }

  async function consumeMultiplex(link: RPCLink<Record<never, never>>): Promise<void> {
    try {
      const output = await link.call(
        ['terminal', 'multiplex'],
        { bulkTicket: options.bulkTicket },
        { context: {}, signal: abort.signal }
      )
      if (!isAsyncIterator(output)) {
        throw new Error('Mobile terminal multiplex returned a non-iterator response.')
      }
      while (!closed) {
        const next = await output.next()
        if (next.done) {
          break
        }
        if (isMessageType(next.value, 'ready')) {
          options.onReady()
        }
      }
      if (!closed) {
        fail(new Error('Mobile terminal multiplex iterator ended.'))
      }
    } catch (error) {
      if (!closed && !abort.signal.aborted) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }

  function fail(error: Error): void {
    if (closed) {
      return
    }
    options.onError(error)
    close(false)
  }

  function close(notify: boolean): void {
    if (closed) {
      return
    }
    closed = true
    abort.abort()
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    channel?.close()
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
    if (notify) {
      options.onClose()
    }
  }
}

function isMessageType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === type
}

function isAsyncIterator(value: unknown): value is AsyncIterator<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'next' in value &&
    typeof value.next === 'function'
  )
}
