import { useEffect, useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { useTabDragActive } from '../tab-group/tab-drag-context'

const TAB_STRIP_DRAG_SCROLL_INTERVAL_MS = 180

export function useTabStripDragScrollHandlers(
  scrollTabStrip: (direction: 'start' | 'end', behavior?: ScrollBehavior) => void,
  canScroll: { start: boolean; end: boolean }
): {
  isTabDragActive: boolean
  onDragScrollStartEnter: () => void
  onDragScrollEndEnter: () => void
  onDragScrollLeave: () => void
} {
  const isTabDragActive = useTabDragActive()
  const intervalRef = useRef<number | null>(null)
  const canScrollRef = useRef(canScroll)
  canScrollRef.current = canScroll

  const stopDragScroll = useEventCallback((): void => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  })

  const startDragScroll = (direction: 'start' | 'end'): void => {
    stopDragScroll()
    if (!isTabDragActive) {
      return
    }

    const canScrollInDirection = (): boolean =>
      direction === 'start' ? canScrollRef.current.start : canScrollRef.current.end

    if (!canScrollInDirection()) {
      return
    }

    const tick = (): void => {
      if (!canScrollInDirection()) {
        stopDragScroll()
        return
      }
      scrollTabStrip(direction, 'auto')
    }
    tick()
    intervalRef.current = window.setInterval(tick, TAB_STRIP_DRAG_SCROLL_INTERVAL_MS)
  }

  useEffect(() => {
    if (!isTabDragActive) {
      stopDragScroll()
    }
  }, [isTabDragActive, stopDragScroll])

  useEffect(() => () => stopDragScroll(), [stopDragScroll])

  return {
    isTabDragActive,
    onDragScrollStartEnter: () => startDragScroll('start'),
    onDragScrollEndEnter: () => startDragScroll('end'),
    onDragScrollLeave: stopDragScroll
  }
}
