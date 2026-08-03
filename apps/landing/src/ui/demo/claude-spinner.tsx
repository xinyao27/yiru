import { cn } from 'cnfast'
import { useEffect, useState } from 'react'

// Why: Claude Code's terminal spinner cycles an asterisk through weights rather
// than rotating a glyph. The session pane depicts Claude's own output, so it
// uses Claude's spinner — Yiru's chrome elsewhere keeps the desktop orb loader.
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const FRAME_MS = 110

export type ClaudeSpinnerProps = {
  className?: string
}

export function ClaudeSpinner({ className }: ClaudeSpinnerProps): React.JSX.Element {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length)
    }, FRAME_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  return (
    <span aria-hidden="true" className={cn('inline-block text-center', className)}>
      {FRAMES[frame]}
    </span>
  )
}
