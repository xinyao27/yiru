import { useRef, useState } from 'react'

export function useViewportScrollRoot(scrollOffsetRef: React.MutableRefObject<number>): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  scrollOffset: number
  markScrollMovement: () => void
  setScrollRoot: (node: HTMLDivElement | null) => void
} {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollOffset, setScrollOffset] = useState(0)

  const markScrollMovement = (): void => {
    const container = scrollRef.current
    if (container) {
      scrollOffsetRef.current = container.scrollTop
      setScrollOffset(container.scrollTop)
    }
  }

  const setScrollRoot = (node: HTMLDivElement | null): void => {
    if (node) {
      const restoredOffset = scrollOffsetRef.current
      node.scrollTop = restoredOffset
      setScrollOffset(restoredOffset)
    } else if (scrollRef.current) {
      scrollOffsetRef.current = scrollRef.current.scrollTop
    }
    scrollRef.current = node
  }

  return { scrollRef, scrollOffset, markScrollMovement, setScrollRoot }
}
