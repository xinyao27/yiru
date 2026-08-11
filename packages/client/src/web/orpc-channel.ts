import { createORPCClient, ORPCError, type ClientLink } from '@orpc/client'
import { RPCLink, type RPCLinkOptions } from '@orpc/client/websocket'
import {
  decodeRuntimeOrpcBinaryFrame,
  decodeRuntimeOrpcSideChannelBinaryFrame,
  decodeRuntimeOrpcTextFrame,
  encodeRuntimeOrpcBinaryFrame,
  encodeRuntimeOrpcTextFrame,
  RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER,
  RUNTIME_ORPC_FEATURE_INTERACTION_SOURCE_HEADER,
  RUNTIME_ORPC_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'
import {
  isBrowserPaneUiRuntimeRpcParams,
  YIRU_RUNTIME_RPC_BROWSER_UI_SOURCE
} from '~shared/runtime-rpc-feature-interaction-source'

import { retainRuntimeOrpcBinaryRoute } from '../runtime/orpc-binary-side-channel'
import type { WebRuntimeOrpcClient, WebRuntimeOrpcClientContext } from './legacy-orpc-link'

export type { WebRuntimeOrpcClient } from './legacy-orpc-link'

const RUNTIME_ORPC_REQUEST_CONTEXT = Symbol('web-runtime-orpc-request-context')

type WebRuntimeOrpcTransportContext = WebRuntimeOrpcClientContext & {
  [RUNTIME_ORPC_REQUEST_CONTEXT]: string
}

type WebRuntimeOrpcWebsocket = RPCLinkOptions<WebRuntimeOrpcTransportContext>['websocket']
type WebRuntimeOrpcEvent = 'message' | 'close'
const WEBSOCKET_OPEN = 1
const WEBSOCKET_CLOSED = 3

export type WebRuntimeOrpcConnection = {
  client: WebRuntimeOrpcClient
  channel: WebRuntimeOrpcChannel
}

export class WebRuntimeOrpcChannel {
  private readonly listeners = new Map<
    WebRuntimeOrpcEvent,
    Set<EventListenerOrEventListenerObject>
  >()
  // Why: `browser.screencast.subscribe` pushes video frames out-of-band from
  // its event-iterator values, over a request-id-tagged side channel that
  // shares this wire with ordinary oRPC messages (see
  // `orpc-binary-side-channel.ts`, the Electron/MessagePort sibling of this
  // registry).
  private readonly binaryListeners = new Map<string, (bytes: Uint8Array<ArrayBufferLike>) => void>()
  private sendQueue = Promise.resolve()
  readyState: WebRuntimeOrpcWebsocket['readyState'] = WEBSOCKET_OPEN

  constructor(
    private readonly sendText: (plaintext: string) => boolean,
    private readonly sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) => boolean
  ) {}

  registerBinaryListener(
    requestId: string,
    listener: ((bytes: Uint8Array<ArrayBufferLike>) => void) | undefined
  ): () => void {
    if (!listener) {
      return () => {}
    }
    this.binaryListeners.set(requestId, listener)
    return () => {
      if (this.binaryListeners.get(requestId) === listener) {
        this.binaryListeners.delete(requestId)
      }
    }
  }

  readonly addEventListener: WebRuntimeOrpcWebsocket['addEventListener'] = (type, listener) => {
    if (type !== 'message' && type !== 'close') {
      return
    }
    let listeners = this.listeners.get(type)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(type, listeners)
    }
    listeners.add(listener)
  }

  readonly removeEventListener: WebRuntimeOrpcWebsocket['removeEventListener'] = (
    type,
    listener
  ) => {
    if (type === 'message' || type === 'close') {
      this.listeners.get(type)?.delete(listener)
    }
  }

  readonly send: WebRuntimeOrpcWebsocket['send'] = (data) => {
    this.sendQueue = this.sendQueue.then(() => this.sendFrame(data)).catch(() => this.close())
  }

  receiveText(frame: string): boolean {
    const payload = decodeRuntimeOrpcTextFrame(frame)
    if (payload === null) {
      return false
    }
    this.emitMessage(payload)
    return true
  }

  receiveBinary(frame: Uint8Array<ArrayBufferLike>): boolean {
    // Why: side-channel frames must be pulled off before the generic oRPC
    // decode below, the same ordering `RuntimeOrpcBinarySideChannel` uses —
    // otherwise a screencast frame would fail `decodeRuntimeOrpcBinaryFrame`
    // silently instead of reaching its registered listener.
    const sideChannelFrame = decodeRuntimeOrpcSideChannelBinaryFrame(frame)
    if (sideChannelFrame) {
      this.binaryListeners.get(sideChannelFrame.requestId)?.(sideChannelFrame.payload)
      return true
    }
    const payload = decodeRuntimeOrpcBinaryFrame(frame)
    if (payload === null) {
      return false
    }
    this.emitMessage(payload)
    return true
  }

  close(): void {
    if (this.readyState === WEBSOCKET_CLOSED) {
      return
    }
    this.readyState = WEBSOCKET_CLOSED
    this.dispatch('close', new Event('close'))
    this.listeners.clear()
    this.binaryListeners.clear()
  }

  private emitMessage(data: unknown): void {
    this.dispatch('message', new MessageEvent('message', { data }))
  }

  private dispatch(type: WebRuntimeOrpcEvent, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(this, event)
      } else {
        listener.handleEvent(event)
      }
    }
  }

  private async sendFrame(
    data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
  ): Promise<void> {
    if (this.readyState !== WEBSOCKET_OPEN) {
      throw new Error('The encrypted oRPC channel is closed')
    }
    const sent =
      typeof data === 'string'
        ? this.sendText(encodeRuntimeOrpcTextFrame(data))
        : this.sendBinary(encodeRuntimeOrpcBinaryFrame(await websocketDataBytes(data)))
    if (!sent) {
      throw new Error('The encrypted oRPC channel is not writable')
    }
  }
}

export function createWebRuntimeOrpcConnection(
  sendText: (plaintext: string) => boolean,
  sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) => boolean,
  onUnauthorized: () => void
): WebRuntimeOrpcConnection {
  const channel = new WebRuntimeOrpcChannel(sendText, sendBinary)
  const transportLink = new RPCLink<WebRuntimeOrpcTransportContext>({
    websocket: channel,
    headers: (options, _path, input) => ({
      [RUNTIME_ORPC_REQUEST_ID_HEADER]: options.context[RUNTIME_ORPC_REQUEST_CONTEXT],
      [RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER]: '1',
      ...(isBrowserPaneUiRuntimeRpcParams(input)
        ? {
            [RUNTIME_ORPC_FEATURE_INTERACTION_SOURCE_HEADER]: YIRU_RUNTIME_RPC_BROWSER_UI_SOURCE
          }
        : {})
    }),
    interceptors: [
      async ({ next }) => {
        try {
          return await next()
        } catch (error) {
          if (error instanceof ORPCError && error.status === 401) {
            onUnauthorized()
          }
          throw error
        }
      }
    ]
  })
  // Why: mirrors `orpc-message-port-client.ts`'s outer wrapping link — a
  // per-call request id both tags the transport-level header above and keys
  // the binary listener registration, so a screencast frame arriving on this
  // one shared WS connection routes to the call that asked for it instead of
  // whichever call happens to be pending.
  const link: ClientLink<WebRuntimeOrpcClientContext> = {
    call: async (path, input, options) => {
      const requestId = crypto.randomUUID()
      const release = channel.registerBinaryListener(requestId, options.context.onBinary)
      try {
        const output = await transportLink.call(path, input, {
          ...options,
          context: { ...options.context, [RUNTIME_ORPC_REQUEST_CONTEXT]: requestId }
        })
        return retainRuntimeOrpcBinaryRoute(output, release)
      } catch (error) {
        release()
        throw error
      }
    }
  }
  return {
    channel,
    client: createORPCClient<WebRuntimeOrpcClient>(link)
  }
}

async function websocketDataBytes(
  data: ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
): Promise<Uint8Array<ArrayBufferLike>> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return new Uint8Array(data)
}
