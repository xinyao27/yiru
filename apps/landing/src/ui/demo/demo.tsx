import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Controls } from './controls'
import { frameIndexAt, stateAtFrame, TOTAL_MS } from './timeline'
import { WorkspaceWindow } from './workspace-window'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function Demo(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(() => (prefersReducedMotion() ? TOTAL_MS : 0))
  const [playing, setPlaying] = useState(false)

  // Why: the fold only has to rerun when a frame boundary is crossed, so
  // scrubbing at 60fps costs a comparison rather than a rebuild.
  const state = useMemo(() => stateAtFrame(frameIndexAt(elapsed)), [elapsed])

  const stop = useCallback(() => {
    setPlaying(false)
    lastTickRef.current = null
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [])

  const start = useCallback(() => {
    if (frameRef.current) {
      return
    }
    setPlaying(true)
    lastTickRef.current = null
    const tick = (timestamp: number): void => {
      const previous = lastTickRef.current
      lastTickRef.current = timestamp
      if (previous !== null) {
        const delta = timestamp - previous
        setElapsed((current) => (current + delta) % TOTAL_MS)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          start()
        } else {
          stop()
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      stop()
    }
  }, [start, stop])

  const handleToggle = useCallback(() => {
    if (frameRef.current) {
      stop()
    } else {
      start()
    }
  }, [start, stop])

  const handleSeek = useCallback(
    (ms: number) => {
      stop()
      setElapsed(Math.max(0, Math.min(ms, TOTAL_MS)))
    },
    [stop]
  )

  const handleReset = useCallback(() => {
    stop()
    setElapsed(0)
    start()
  }, [start, stop])

  return (
    <div ref={containerRef}>
      <WorkspaceWindow state={state} />
      <Controls
        playing={playing}
        elapsed={elapsed}
        onToggle={handleToggle}
        onSeek={handleSeek}
        onReset={handleReset}
      />
    </div>
  )
}
