import { RPCLink } from '@orpc/client/websocket'
import {
  encodeRuntimeOrpcSideChannelBinaryFrame,
  RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER,
  RUNTIME_ORPC_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { DedicatedRemoteRuntimeOrpcPeer } from '@yiru/shared/remote-runtime/dedicated-orpc-peer'

type TerminalMultiplexCallbacks = {
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
  onError?: (error: { code: string; message: string }) => void
  onClose?: () => void
}

type OpenWebTerminalMultiplexSubscriptionOptions = {
  requestId: string
  params: unknown
  runtimeId: string
  callbacks: TerminalMultiplexCallbacks
  sendText: (frame: string) => boolean
  sendBinary: (frame: Uint8Array<ArrayBufferLike>) => boolean
  onCreated: (subscription: WebTerminalMultiplexSubscription) => void
}

export type WebTerminalMultiplexSubscription = {
  close: () => void
  receiveBinary: (frame: Uint8Array<ArrayBufferLike>) => boolean
  receiveText: (frame: string) => boolean
  sendBinary: (frame: Uint8Array<ArrayBufferLike>) => void
  transportClosed: () => void
}

export async function openWebTerminalMultiplexSubscription({
  requestId,
  params,
  runtimeId,
  callbacks,
  sendText,
  sendBinary,
  onCreated
}: OpenWebTerminalMultiplexSubscriptionOptions): Promise<WebTerminalMultiplexSubscription> {
  const abort = new AbortController()
  const peer = new DedicatedRemoteRuntimeOrpcPeer(requestId, sendText, sendBinary, (frame) =>
    callbacks.onBinary?.(frame)
  )
  let isOpen = true
  const close = (): void => {
    if (!isOpen) {
      return
    }
    isOpen = false
    // Why: oRPC encodes its abort frame asynchronously. Close the peer first so
    // it detaches the abort listener before the signal fires against a closed peer.
    peer.close()
    abort.abort()
  }
  const subscription: WebTerminalMultiplexSubscription = {
    close,
    receiveBinary: (frame) => isOpen && peer.receiveBinary(frame),
    receiveText: (frame) => isOpen && peer.receiveText(frame),
    sendBinary: (frame) => {
      if (isOpen) {
        sendBinary(encodeRuntimeOrpcSideChannelBinaryFrame(requestId, frame))
      }
    },
    transportClosed: () => {
      if (!isOpen) {
        return
      }
      close()
      callbacks.onClose?.()
    }
  }
  onCreated(subscription)
  const link = new RPCLink<Record<never, never>>({
    websocket: peer,
    headers: {
      [RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER]: '1',
      [RUNTIME_ORPC_REQUEST_ID_HEADER]: requestId
    }
  })

  // Why: the host's event iterator becomes readable only after the binary
  // epoch handshake. Return the writable side-channel first so the caller can
  // answer the epoch offer instead of deadlocking on link.call().
  void startTerminalMultiplexOutput(link, params, abort.signal, {
    callbacks,
    close,
    isOpen: () => isOpen,
    requestId,
    runtimeId
  })

  return subscription
}

async function startTerminalMultiplexOutput(
  link: RPCLink<Record<never, never>>,
  params: unknown,
  signal: AbortSignal,
  options: {
    callbacks: TerminalMultiplexCallbacks
    close: () => void
    isOpen: () => boolean
    requestId: string
    runtimeId: string
  }
): Promise<void> {
  try {
    const output = await link.call(['terminal', 'multiplex'], params, { context: {}, signal })
    if (!isAsyncIterable(output)) {
      throw new Error('Runtime host returned an invalid terminal multiplex subscription.')
    }
    await consumeTerminalMultiplexOutput(output, options)
  } catch (error) {
    if (!options.isOpen()) {
      return
    }
    options.close()
    options.callbacks.onError?.({
      code: 'invalid_runtime_response',
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

async function consumeTerminalMultiplexOutput(
  output: AsyncIterable<unknown>,
  options: {
    callbacks: TerminalMultiplexCallbacks
    close: () => void
    isOpen: () => boolean
    requestId: string
    runtimeId: string
  }
): Promise<void> {
  try {
    for await (const result of output) {
      if (!options.isOpen()) {
        return
      }
      options.callbacks.onResponse({
        id: options.requestId,
        ok: true,
        result,
        _meta: { runtimeId: options.runtimeId }
      })
    }
    if (options.isOpen()) {
      options.close()
      options.callbacks.onClose?.()
    }
  } catch (error) {
    if (!options.isOpen()) {
      return
    }
    options.close()
    options.callbacks.onError?.({
      code: 'invalid_runtime_response',
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
