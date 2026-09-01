import type {
  RuntimeEmulatorFrameStreamEvent,
  RuntimeEmulatorFrameStreamInput,
  RuntimeEmulatorVideoStreamEvent,
  RuntimeEmulatorVideoStreamInput
} from '@yiru/runtime-protocol/contract'
import { useAppStore } from '~renderer/store/state'

import { createRuntimeOrpcClient } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

type EmulatorFrameStreamHandlers = {
  onError: (message: string) => void
  onFrame: (bytes: Uint8Array<ArrayBufferLike>) => void
}

type EmulatorVideoStreamHandlers = {
  onError: (message: string) => void
  onFrame: (frame: {
    config: boolean
    keyFrame: boolean
    bytes: Uint8Array<ArrayBufferLike>
  }) => void
  onMeta: (meta: { codecId: string; width: number; height: number }) => void
}

const VIDEO_CONFIG_FLAG = 1
const VIDEO_KEY_FRAME_FLAG = 2

function emulatorStreamTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export function subscribeEmulatorFrameStream(
  input: RuntimeEmulatorFrameStreamInput,
  handlers: EmulatorFrameStreamHandlers
): () => void {
  return subscribeEmulatorStream(
    async (signal, onBinary) => {
      const connection = await createRuntimeOrpcClient(emulatorStreamTarget(), { signal })
      const stream = await connection.client.emulator.frameStream.subscribe(input, {
        signal,
        context: { onBinary }
      })
      return { connection, stream }
    },
    handlers.onFrame,
    (event: RuntimeEmulatorFrameStreamEvent) => {
      if (event.type === 'error') {
        handlers.onError(event.message)
      }
    },
    handlers.onError
  )
}

export function subscribeEmulatorVideoStream(
  input: RuntimeEmulatorVideoStreamInput,
  handlers: EmulatorVideoStreamHandlers
): () => void {
  return subscribeEmulatorStream(
    async (signal, onBinary) => {
      const connection = await createRuntimeOrpcClient(emulatorStreamTarget(), { signal })
      const stream = await connection.client.emulator.videoStream.subscribe(input, {
        signal,
        context: { onBinary }
      })
      return { connection, stream }
    },
    (payload) => {
      if (payload.byteLength === 0) {
        return
      }
      const flags = payload[0] ?? 0
      handlers.onFrame({
        config: (flags & VIDEO_CONFIG_FLAG) !== 0,
        keyFrame: (flags & VIDEO_KEY_FRAME_FLAG) !== 0,
        bytes: payload.slice(1)
      })
    },
    (event: RuntimeEmulatorVideoStreamEvent) => {
      if (event.type === 'meta') {
        handlers.onMeta(event)
      }
    },
    handlers.onError
  )
}

function subscribeEmulatorStream<TEvent>(
  open: (
    signal: AbortSignal,
    onBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  ) => Promise<{
    connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>>
    stream: AsyncIterable<TEvent>
  }>,
  onBinary: (bytes: Uint8Array<ArrayBufferLike>) => void,
  onEvent: (event: TEvent) => void,
  onError: (message: string) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
    try {
      const opened = await open(controller.signal, onBinary)
      connection = opened.connection
      for await (const event of opened.stream) {
        if (controller.signal.aborted) {
          return
        }
        onEvent(event)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        onError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      connection?.close()
    }
  })()
  return () => controller.abort()
}
