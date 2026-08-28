import { useEffect, useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

export function useRevealHighlight(): {
  highlightedRowKey: string | null
  flash: (rowKey: string) => void
  clear: () => void
} {
  const [highlightedRowKey, setHighlightedRowKey] = useState<string | null>(null)
  const frameIdRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const clear = useEventCallback(() => {
    if (frameIdRef.current !== null) {
      window.cancelAnimationFrame(frameIdRef.current)
      frameIdRef.current = null
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  })
  const flash = useEventCallback((rowKey: string) => {
    clear()
    // Why: remove before add restarts the CSS glow when the same active row is revealed again.
    setHighlightedRowKey(null)
    frameIdRef.current = window.requestAnimationFrame(() => {
      frameIdRef.current = null
      setHighlightedRowKey(rowKey)
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null
        setHighlightedRowKey(null)
      }, 1500)
    })
  })
  useEffect(() => clear, [clear])
  return { highlightedRowKey, flash, clear }
}
