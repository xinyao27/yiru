import type { RefObject } from 'react'
import { useCallback, useRef } from 'react'

const DRAG_EDGE_ZONE_PX = 48

export function getDragEdgeScrollTarget({
  scrollTop,
  scrollHeight,
  clientHeight,
  localY,
  edgeZonePx = DRAG_EDGE_ZONE_PX
}: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  localY: number
  edgeZonePx?: number
}): number | null {
  let delta = 0
  if (localY < edgeZonePx) {
    const strength = (edgeZonePx - localY) / edgeZonePx
    delta = -(1.25 + strength * 9)
  } else if (localY > clientHeight - edgeZonePx) {
    const strength = (localY - (clientHeight - edgeZonePx)) / edgeZonePx
    delta = 1.25 + strength * 9
  }
  if (delta === 0) {
    return null
  }

  const maxScroll = Math.max(0, scrollHeight - clientHeight)
  const nextScrollTop = Math.max(0, Math.min(maxScroll, scrollTop + delta))
  return nextScrollTop === scrollTop ? null : nextScrollTop
}

export function useFileExplorerDragEdgeScroll(scrollRef: RefObject<HTMLDivElement | null>): {
  recordDragClientY: (clientY: number) => void
  stopDragEdgeScroll: () => void
} {
  const lastDragClientYRef = useRef<number | null>(null)
  const edgeScrollRafRef = useRef<number | null>(null)

  const stopDragEdgeScroll = useCallback(() => {
    lastDragClientYRef.current = null
    if (edgeScrollRafRef.current !== null) {
      cancelAnimationFrame(edgeScrollRafRef.current)
      edgeScrollRafRef.current = null
    }
  }, [])

  const tickDragEdgeScroll = useCallback(() => {
    edgeScrollRafRef.current = null
    const viewport = scrollRef.current
    const clientY = lastDragClientYRef.current
    if (!viewport || clientY === null) {
      return
    }
    const rect = viewport.getBoundingClientRect()
    const nextScrollTop = getDragEdgeScrollTarget({
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      localY: clientY - rect.top
    })
    if (nextScrollTop !== null) {
      viewport.scrollTop = nextScrollTop
      edgeScrollRafRef.current = requestAnimationFrame(tickDragEdgeScroll)
    }
  }, [scrollRef])

  const recordDragClientY = useCallback(
    (clientY: number): void => {
      lastDragClientYRef.current = clientY
      if (edgeScrollRafRef.current === null) {
        edgeScrollRafRef.current = requestAnimationFrame(tickDragEdgeScroll)
      }
    },
    [tickDragEdgeScroll]
  )

  return { recordDragClientY, stopDragEdgeScroll }
}
