import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { subscribeEmulatorVideoStream } from '~renderer/runtime/emulator-stream-client'

// scrcpy emits Annex-B H.264; the decoder is configured without an avcC
// description and the SPS/PPS config packet is prepended to the first keyframe.
const H264_CODEC = 'avc1.640028'

type StreamSize = { width: number; height: number }

type VideoStreamState = {
  error: string | null
  streamIdentity: string | null
}

function getVideoStreamIdentity(
  deviceId: string | undefined,
  streamKey: string | undefined,
  enabled: boolean
): string | null {
  return enabled && deviceId ? `${deviceId}::${streamKey ?? ''}` : null
}

export function useEmulatorVideoStream(
  deviceId: string | undefined,
  streamKey: string | undefined,
  enabled: boolean,
  onSize?: (size: StreamSize) => void
): { canvasRef: React.RefObject<HTMLCanvasElement | null>; error: string | null } {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamIdentity = getVideoStreamIdentity(deviceId, streamKey, enabled)
  const [state, setState] = useState<VideoStreamState>({ error: null, streamIdentity: null })
  const onSizeRef = useRef(onSize)
  onSizeRef.current = onSize

  useEffect(() => {
    if (!streamIdentity || !deviceId) {
      return
    }
    setState({ error: null, streamIdentity })
    const DecoderCtor = (globalThis as { VideoDecoder?: typeof VideoDecoder }).VideoDecoder
    const ChunkCtor = (globalThis as { EncodedVideoChunk?: typeof EncodedVideoChunk })
      .EncodedVideoChunk
    if (!DecoderCtor || !ChunkCtor) {
      setState({
        error: translate(
          'auto.components.emulator.pane.use.emulator.video.stream.c3fb77cb87',
          'This build does not support WebCodecs H.264 decoding.'
        ),
        streamIdentity
      })
      return
    }

    let disposed = false
    let configured = false
    let timestamp = 0
    let configBytes: Uint8Array | null = null
    let unsubscribe: (() => void) | undefined
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d') ?? null
    context?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0)

    const decoder = new DecoderCtor({
      output: (frame) => {
        if (!disposed && context && canvas) {
          clearFirstFrameTimeout()
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth
            canvas.height = frame.displayHeight
          }
          context.drawImage(frame, 0, 0)
        }
        frame.close()
      },
      error: (error) => fatal(error.message)
    })

    let firstFrameTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      fatal('Android video stream did not deliver a frame.')
    }, 10_000)

    const clearFirstFrameTimeout = (): void => {
      if (firstFrameTimeout) {
        clearTimeout(firstFrameTimeout)
        firstFrameTimeout = null
      }
    }
    const cleanup = (): void => {
      if (disposed) {
        return
      }
      disposed = true
      clearFirstFrameTimeout()
      unsubscribe?.()
      unsubscribe = undefined
      if (decoder.state !== 'closed') {
        decoder.close()
      }
    }
    function fatal(message: string): void {
      if (disposed) {
        return
      }
      setState({ error: message, streamIdentity })
      cleanup()
    }

    unsubscribe = subscribeEmulatorVideoStream(
      { deviceId },
      {
        onError: fatal,
        onMeta: (meta) => {
          if (!disposed) {
            onSizeRef.current?.({ width: meta.width, height: meta.height })
          }
        },
        onFrame: (message) => {
          if (disposed) {
            return
          }
          const data = new Uint8Array(message.bytes)
          if (message.config) {
            if (!configured) {
              try {
                decoder.configure({ codec: H264_CODEC, optimizeForLatency: true })
              } catch (error) {
                fatal(
                  error instanceof Error ? error.message : 'Failed to configure the H.264 decoder.'
                )
                return
              }
              configured = true
            }
            configBytes = data
            return
          }
          if (!configured || decoder.state === 'closed') {
            return
          }
          let chunkData = data
          if (message.keyFrame && configBytes) {
            chunkData = new Uint8Array(configBytes.length + data.length)
            chunkData.set(configBytes, 0)
            chunkData.set(data, configBytes.length)
            configBytes = null
          }
          try {
            timestamp += 1
            decoder.decode(
              new ChunkCtor({
                type: message.keyFrame ? 'key' : 'delta',
                timestamp,
                data: chunkData
              })
            )
          } catch (error) {
            fatal(
              error instanceof Error ? error.message : 'Failed to decode an Android video frame.'
            )
          }
        }
      }
    )

    return cleanup
  }, [deviceId, streamIdentity])

  const error = state.streamIdentity === streamIdentity ? state.error : null
  return { canvasRef, error }
}
