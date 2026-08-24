import type React from 'react'
import { useLayoutEffect, useState } from 'react'

import type { CursorTarget } from './workbench-storyboard-types'

export function useFakeCursor(
  panelRef: React.RefObject<HTMLDivElement | null>,
  leftPaneRef: React.RefObject<HTMLDivElement | null>,
  splitRowRef: React.RefObject<HTMLDivElement | null>,
  target: CursorTarget,
  reducedMotion: boolean
): { x: number; y: number; visible: boolean } {
  const [pos, setPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false
  })

  // Why: rect math has to run after layout/commit so refs have measurable
  // boxes. useLayoutEffect avoids a frame of stale position.
  useLayoutEffect(() => {
    if (reducedMotion) {
      setPos((p) => ({ ...p, visible: false }))
      return
    }
    const panel = panelRef.current
    if (!panel) {
      return
    }
    if (target.kind === 'hidden') {
      setPos((p) => ({ ...p, visible: false }))
      return
    }
    const panelRect = panel.getBoundingClientRect()
    if (target.kind === 'pane') {
      const pane = leftPaneRef.current
      if (!pane) {
        return
      }
      const rect = pane.getBoundingClientRect()
      // Park near the prompt area — same offsets as the HTML mock.
      setPos({
        x: rect.left - panelRect.left + 90,
        y: rect.top - panelRect.top + 110,
        visible: true
      })
      return
    }
    const row = splitRowRef.current
    if (!row) {
      return
    }
    const rect = row.getBoundingClientRect()
    setPos({
      x: rect.left - panelRect.left + 12,
      y: rect.top - panelRect.top + 11,
      visible: true
    })
  }, [target, reducedMotion, panelRef, leftPaneRef, splitRowRef])

  return pos
}
