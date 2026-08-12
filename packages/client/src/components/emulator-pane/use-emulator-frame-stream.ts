import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { subscribeEmulatorFrameStream } from '~renderer/runtime/emulator-stream-client'

const FIRST_FRAME_TIMEOUT_MS = 6_000

type EmulatorFrameStreamState = {
  error: string | null
  frameUrl: string | null
  streamIdentity: string | null
}

function createFrameUrl(bytes: Uint8Array<ArrayBufferLike>): string {
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }))
}

function getFrameStreamIdentity(
  streamUrl: string | undefined,
  streamKey: string | undefined,
  enabled: boolean
): string | null {
  return enabled && streamUrl ? `${streamUrl}::${streamKey ?? ''}` : null
}

export function useEmulatorFrameStream(
  streamUrl: string | undefined,
  streamKey: string | undefined,
  enabled: boolean
): Omit<EmulatorFrameStreamState, 'streamIdentity'> {
  const streamIdentity = getFrameStreamIdentity(streamUrl, streamKey, enabled)
  const [state, setState] = useState<EmulatorFrameStreamState>({
    error: null,
    frameUrl: null,
    streamIdentity: null
  })
  const currentFrameUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !streamUrl) {
      setState({ error: null, frameUrl: null, streamIdentity })
      return
    }

    let disposed = false
    let firstFrameTimer: number | null = window.setTimeout(() => {
      setState((current) =>
        current.streamIdentity !== streamIdentity || current.frameUrl
          ? current
          : {
              ...current,
              error: translate(
                'auto.components.emulator.pane.use.emulator.frame.stream.f1c0179002',
                'Stream is not producing frames.'
              )
            }
      )
    }, FIRST_FRAME_TIMEOUT_MS)

    const clearFirstFrameTimer = (): void => {
      if (firstFrameTimer !== null) {
        window.clearTimeout(firstFrameTimer)
        firstFrameTimer = null
      }
    }
    const revokeCurrentFrameUrl = (): void => {
      if (currentFrameUrlRef.current) {
        URL.revokeObjectURL(currentFrameUrlRef.current)
        currentFrameUrlRef.current = null
      }
    }

    setState({ error: null, frameUrl: null, streamIdentity })
    const unsubscribe = subscribeEmulatorFrameStream(
      { streamUrl, streamKey },
      {
        onFrame: (bytes) => {
          if (disposed) {
            return
          }
          clearFirstFrameTimer()
          const nextFrameUrl = createFrameUrl(bytes)
          const previousFrameUrl = currentFrameUrlRef.current
          currentFrameUrlRef.current = nextFrameUrl
          setState({ error: null, frameUrl: nextFrameUrl, streamIdentity })
          if (previousFrameUrl) {
            URL.revokeObjectURL(previousFrameUrl)
          }
        },
        onError: (message) => {
          if (!disposed) {
            setState((current) =>
              current.streamIdentity === streamIdentity
                ? { ...current, error: message || 'Stream disconnected' }
                : current
            )
          }
        }
      }
    )

    return () => {
      disposed = true
      clearFirstFrameTimer()
      unsubscribe()
      revokeCurrentFrameUrl()
    }
  }, [enabled, streamIdentity, streamKey, streamUrl])

  if (state.streamIdentity !== streamIdentity) {
    return { error: null, frameUrl: null }
  }
  return { error: state.error, frameUrl: state.frameUrl }
}
