import { randomBytes, sign } from 'node:crypto'

import { WEB_CONNECT_PROTOCOL_VERSION } from '@yiru/runtime-protocol/web-connect'
import {
  RelayBrowserAuthEnvelopeSchema,
  WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES
} from '@yiru/runtime-protocol/web-connect/relay-frames'
import { machineRelayAuthSigningMessage } from '@yiru/runtime-protocol/web-connect/signing-messages'
import { WebSocket } from 'ws'

import { openBrowserChannel } from './browser-channel'
import { applyBrowserRevocationFrame } from './browser-revocation'
import { connectOrigin } from './connect-origin'
import type { ConnectIdentityStore, MachineIdentity } from './identity'
import {
  connectionCloseFrame,
  decodeRelayFrame,
  encodeRelayFrame,
  parseConnectionClose
} from './relay-frame'

// Why: whichever local runtime answers browser traffic — the app's own transport
// or a runtime host the CLI spawned — it hands the bridge these three values and
// nothing else, so one bridge serves both hosts.
export type LocalRuntimeTarget = {
  deviceToken: string
  endpoint: string
  runtimePublicKeyB64: string
}

export type RelayBridge = {
  stop: () => void
}

export type RelayBridgeOptions = {
  identity: MachineIdentity
  machineId: string
  onOffline?: () => void
  onOnline?: () => void
  store: ConnectIdentityStore
  target: LocalRuntimeTarget
}

const RECONNECT_DELAY_MS = 1_000

export function startRelayBridge(options: RelayBridgeOptions): RelayBridge {
  const localSockets = new Map<string, WebSocket>()
  let relaySocket: WebSocket | null = null
  let stopped = false

  const connectRelay = (): void => {
    if (stopped) {
      return
    }
    const socket = new WebSocket(machineSocketUrl(options.machineId), {
      maxPayload: WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES
    })
    relaySocket = socket
    socket.on('open', () => sendMachineAuth(socket, options))
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(1008, 'Invalid relay frame')
        return
      }
      handleRelayText(socket, data.toString(), localSockets, options)
    })
    socket.on('close', () => {
      for (const local of localSockets.values()) {
        local.close()
      }
      localSockets.clear()
      options.onOffline?.()
      if (!stopped) {
        setTimeout(connectRelay, RECONNECT_DELAY_MS)
      }
    })
    socket.on('error', () => {})
  }
  connectRelay()

  return {
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      for (const local of localSockets.values()) {
        local.close()
      }
      localSockets.clear()
      relaySocket?.close()
    }
  }
}

function sendMachineAuth(socket: WebSocket, options: RelayBridgeOptions): void {
  const unsigned = {
    machineId: options.machineId,
    timestamp: Date.now(),
    nonce: randomBytes(18).toString('base64url'),
    runtimePublicKeyB64: options.target.runtimePublicKeyB64
  }
  socket.send(
    JSON.stringify({
      type: 'machine-auth',
      version: WEB_CONNECT_PROTOCOL_VERSION,
      ...unsigned,
      signature: sign(
        null,
        Buffer.from(machineRelayAuthSigningMessage(unsigned)),
        options.identity.privateKey
      ).toString('base64url')
    })
  )
}

function handleRelayText(
  socket: WebSocket,
  text: string,
  localSockets: Map<string, WebSocket>,
  options: RelayBridgeOptions
): void {
  const envelope = parseBrowserAuthEnvelope(text)
  if (envelope) {
    localSockets.get(envelope.connectionId)?.close()
    const local = attachBrowserChannel(socket, envelope, localSockets, options)
    if (local) {
      localSockets.set(envelope.connectionId, local)
    }
    return
  }
  if (applyBrowserRevocationFrame(options.store, text)) {
    return
  }
  if (text.includes('"type":"machine-ready"')) {
    options.onOnline?.()
    return
  }
  const close = parseConnectionClose(text)
  if (close) {
    localSockets.get(close.connectionId)?.close()
    localSockets.delete(close.connectionId)
    return
  }
  const frame = decodeRelayFrame(text)
  const local = frame ? localSockets.get(frame.connectionId) : null
  if (frame && local?.readyState === WebSocket.OPEN) {
    local.send(frame.data, { binary: frame.isBinary })
  }
}

function attachBrowserChannel(
  socket: WebSocket,
  envelope: ReturnType<typeof RelayBrowserAuthEnvelopeSchema.parse>,
  localSockets: Map<string, WebSocket>,
  options: RelayBridgeOptions
): WebSocket | null {
  let local: WebSocket | null = null
  local = openBrowserChannel({
    envelope,
    store: options.store,
    localEndpoint: options.target.endpoint,
    deviceToken: options.target.deviceToken,
    runtimePublicKeyB64: options.target.runtimePublicKeyB64,
    identity: options.identity,
    callbacks: {
      onClose: () => {
        if (localSockets.get(envelope.connectionId) === local) {
          localSockets.delete(envelope.connectionId)
          sendRelayJson(socket, connectionCloseFrame(envelope.connectionId))
        }
      },
      sendFrame: (frame, binary) => {
        const encoded = encodeRelayFrame(envelope.connectionId, frame, binary)
        if (encoded) {
          sendRelayJson(socket, encoded)
        } else {
          local?.close(1009, 'Relay frame is too large')
        }
      },
      sendReady: (readyMessage) => {
        const ready = encodeRelayFrame(
          envelope.connectionId,
          Buffer.from(JSON.stringify(readyMessage)),
          false
        )
        if (ready) {
          sendRelayJson(socket, ready)
        }
      }
    }
  })
  return local
}

function parseBrowserAuthEnvelope(
  value: string
): ReturnType<typeof RelayBrowserAuthEnvelopeSchema.parse> | null {
  try {
    const parsed = RelayBrowserAuthEnvelopeSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function sendRelayJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value))
  }
}

function machineSocketUrl(machineId: string): string {
  const origin = new URL(connectOrigin())
  origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:'
  origin.pathname = `/api/connect/machines/${encodeURIComponent(machineId)}/socket`
  return origin.toString()
}
