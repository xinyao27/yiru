import {
  decodeRuntimeOrpcBinaryFrame,
  decodeRuntimeOrpcSideChannelBinaryFrame,
  decodeRuntimeOrpcTextFrame,
  encodeRuntimeOrpcBinaryFrame,
  encodeRuntimeOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'
import type {
  BrowserHostTerminalMultiplexHandle,
  BrowserHostTerminalMultiplexOptions
} from '~renderer/runtime/browser-host-runtime'

import type { ExtensionRuntimeBootstrap } from './session'
import { extensionRuntimeSocketUrl, waitForExtensionRuntimeSocket } from './socket-endpoint'
import {
  openExtensionTerminalMultiplexSubscription,
  type ExtensionTerminalMultiplexSubscription
} from './terminal-multiplex-subscription'

export async function openExtensionTerminalMultiplex(
  bootstrap: ExtensionRuntimeBootstrap,
  options: BrowserHostTerminalMultiplexOptions
): Promise<BrowserHostTerminalMultiplexHandle> {
  const socket = new WebSocket(extensionRuntimeSocketUrl(bootstrap))
  socket.binaryType = 'arraybuffer'
  await waitForExtensionRuntimeSocket(socket)
  const requestId = crypto.randomUUID()
  let subscription: ExtensionTerminalMultiplexSubscription | null = null
  let intentionallyClosed = false
  const handleMessage = (event: MessageEvent<unknown>): void => {
    if (typeof event.data === 'string') {
      if (!subscription?.receiveText(encodeRuntimeOrpcTextFrame(event.data))) {
        socket.close(1003, 'Invalid terminal multiplex response')
      }
      return
    }
    if (!(event.data instanceof ArrayBuffer)) {
      socket.close(1003, 'Invalid terminal multiplex response')
      return
    }
    const bytes = new Uint8Array(event.data)
    const frame = decodeRuntimeOrpcSideChannelBinaryFrame(bytes)
      ? bytes
      : encodeRuntimeOrpcBinaryFrame(bytes)
    if (!subscription?.receiveBinary(frame)) {
      socket.close(1003, 'Invalid terminal multiplex response')
    }
  }
  socket.addEventListener('message', handleMessage)
  socket.addEventListener(
    'close',
    () => {
      socket.removeEventListener('message', handleMessage)
      if (!intentionallyClosed) {
        subscription?.transportClosed()
      }
    },
    { once: true }
  )
  subscription = await openExtensionTerminalMultiplexSubscription({
    callbacks: {
      onBinary: options.onBinary,
      onClose: options.onClose,
      onError: (error) => options.onError(new Error(error.message)),
      onResponse: options.onResponse
    },
    onCreated: (created) => {
      subscription = created
    },
    params: { bulkTicket: options.ticket.bulkTicket },
    requestId,
    runtimeId: options.environmentIdentity,
    sendBinary: (frame) => {
      const orpcPayload = decodeRuntimeOrpcBinaryFrame(frame)
      return sendSocketFrame(socket, orpcPayload ?? frame)
    },
    sendText: (frame) => {
      const payload = decodeRuntimeOrpcTextFrame(frame)
      return payload !== null && sendSocketFrame(socket, payload)
    }
  })
  return {
    sendBinary: (bytes) => subscription?.sendBinary(bytes),
    unsubscribe: () => {
      intentionallyClosed = true
      subscription?.close()
      socket.close(1000, 'Terminal multiplex closed')
    }
  }
}

function sendSocketFrame(socket: WebSocket, frame: string | Uint8Array<ArrayBufferLike>): boolean {
  if (socket.readyState !== WebSocket.OPEN) {
    return false
  }
  if (typeof frame === 'string') {
    socket.send(frame)
  } else {
    const copy = new Uint8Array(frame.byteLength)
    copy.set(frame)
    socket.send(copy.buffer)
  }
  return true
}
