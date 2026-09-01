import type {
  RuntimeEmulatorFrameStreamEvent,
  RuntimeEmulatorFrameStreamInput,
  RuntimeEmulatorVideoStreamEvent,
  RuntimeEmulatorVideoStreamInput
} from '@yiru/runtime-protocol/contract'
import { MjpegFrameStream } from '~main/emulator/mjpeg-frame-stream'
import { scrcpyVideoRegistry } from '~main/emulator/scrcpy-video-registry'

import type { RpcContext } from '../core'

const VIDEO_CONFIG_FLAG = 1
const VIDEO_KEY_FRAME_FLAG = 2

function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve()
  }
  return new Promise((resolve) =>
    signal?.addEventListener('abort', () => resolve(), { once: true })
  )
}

export async function handleEmulatorFrameStream(
  input: RuntimeEmulatorFrameStreamInput,
  { sendBinary, signal }: RpcContext,
  emit: (event: RuntimeEmulatorFrameStreamEvent) => void
): Promise<void> {
  if (!sendBinary) {
    throw new Error('emulator_binary_side_channel_unavailable')
  }
  const stream = new MjpegFrameStream(
    input.streamUrl,
    {
      onError: (message) => emit({ type: 'error', message }),
      onFrame: (frame) => sendBinary(frame)
    },
    input.streamKey
  )
  emit({ type: 'ready' })
  stream.start()
  await waitForAbort(signal)
  stream.stop()
  emit({ type: 'end' })
}

export async function handleEmulatorVideoStream(
  input: RuntimeEmulatorVideoStreamInput,
  { sendBinary, signal }: RpcContext,
  emit: (event: RuntimeEmulatorVideoStreamEvent) => void
): Promise<void> {
  if (!sendBinary) {
    throw new Error('emulator_binary_side_channel_unavailable')
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const unsubscribe = scrcpyVideoRegistry.subscribe(input.deviceId, (event) => {
    if (event.type === 'meta') {
      emit({ type: 'meta', ...event.meta })
      return
    }
    const source = new Uint8Array(event.frame.bytes)
    const payload = new Uint8Array(source.byteLength + 1)
    payload[0] =
      (event.frame.config ? VIDEO_CONFIG_FLAG : 0) |
      (event.frame.keyFrame ? VIDEO_KEY_FRAME_FLAG : 0)
    payload.set(source, 1)
    sendBinary(payload)
  })
  emit({ type: 'ready' })
  await waitForAbort(signal)
  unsubscribe()
  emit({ type: 'end' })
}
