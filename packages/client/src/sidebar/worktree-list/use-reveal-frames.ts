import { useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

export function useRevealFrames(): {
  cancel: () => void
  schedule: (callback: FrameRequestCallback) => void
} {
  const frameIdsRef = useRef<Set<number>>(new Set())
  const cancel = useEventCallback(() => {
    for (const frameId of frameIdsRef.current) {
      window.cancelAnimationFrame(frameId)
    }
    frameIdsRef.current.clear()
  })
  const schedule = useEventCallback((callback: FrameRequestCallback) => {
    const frameId = window.requestAnimationFrame((time) => {
      frameIdsRef.current.delete(frameId)
      callback(time)
    })
    frameIdsRef.current.add(frameId)
  })
  return { cancel, schedule }
}
