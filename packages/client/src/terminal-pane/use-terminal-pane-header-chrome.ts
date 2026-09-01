import { useEffect, useLayoutEffect, useState } from 'react'

import { useEventCallback } from '../react/use-event-callback'
import { fitPanes } from './pane-interactions'
import type { PaneManager } from './pane-manager/pane-manager'
import {
  addSessionRestoredBannerPaneId,
  dismissSessionRestoredBannerPaneIds,
  pruneSessionRestoredBannerPaneIds,
  removeSessionRestoredBannerPaneId,
  syncSessionRestoredBannerTitleSpace
} from './session-restored-banner-pane-state'
import { useSessionRestoredBannerDismiss } from './use-session-restored-banner-dismiss'

export type PaneTitleOverlayRect = {
  left: number
  top: number
  width: number
}

type TerminalPaneHeaderChromeInput = {
  containerRef: React.RefObject<HTMLDivElement | null>
  expandedPaneId: number | null
  isVisible: boolean
  managerRef: React.RefObject<PaneManager | null>
  paneCount: number
  paneLayoutRevision: number
  paneTitles: Record<number, string>
  renamingPaneId: number | null
  shouldMeasureHiddenStartup: boolean
}

function overlayRectsEqual(
  current: Record<number, PaneTitleOverlayRect>,
  next: Record<number, PaneTitleOverlayRect>
): boolean {
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  if (currentKeys.length !== nextKeys.length) {
    return false
  }
  return currentKeys.every((key) => {
    const paneId = Number(key)
    return (
      Math.abs((current[paneId]?.left ?? 0) - (next[paneId]?.left ?? 0)) < 0.5 &&
      Math.abs((current[paneId]?.top ?? 0) - (next[paneId]?.top ?? 0)) < 0.5 &&
      Math.abs((current[paneId]?.width ?? 0) - (next[paneId]?.width ?? 0)) < 0.5
    )
  })
}

export function useTerminalPaneHeaderChrome({
  containerRef,
  expandedPaneId,
  isVisible,
  managerRef,
  paneCount,
  paneLayoutRevision,
  paneTitles,
  renamingPaneId,
  shouldMeasureHiddenStartup
}: TerminalPaneHeaderChromeInput): {
  clearSessionRestoredBannerForPane: (paneId: number) => void
  paneTitleOverlayRects: Record<number, PaneTitleOverlayRect>
  sessionRestoredBannerPaneIds: Set<number>
  showRestoredSessionBanner: (paneId: number) => void
} {
  const [sessionRestoredBannerPaneIds, setSessionRestoredBannerPaneIds] = useState<Set<number>>(
    () => new Set()
  )
  const [paneTitleOverlayRects, setPaneTitleOverlayRects] = useState<
    Record<number, PaneTitleOverlayRect>
  >({})
  const clearSessionRestoredBannerForPane = (paneId: number): void => {
    setSessionRestoredBannerPaneIds((current) => removeSessionRestoredBannerPaneId(current, paneId))
  }
  const showRestoredSessionBanner = (paneId: number): void => {
    setSessionRestoredBannerPaneIds((current) => addSessionRestoredBannerPaneId(current, paneId))
  }
  useSessionRestoredBannerDismiss(sessionRestoredBannerPaneIds.size > 0, containerRef, (event) => {
    setSessionRestoredBannerPaneIds((current) =>
      dismissSessionRestoredBannerPaneIds(current, event, managerRef.current?.getPanes() ?? [])
    )
  })

  useLayoutEffect(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    const needsFit = syncSessionRestoredBannerTitleSpace({
      panes: manager.getPanes(),
      paneTitles,
      renamingPaneId,
      sessionRestoredBannerPaneIds
    })
    if (needsFit && (isVisible || shouldMeasureHiddenStartup)) {
      fitPanes(manager)
    }
  }, [
    isVisible,
    managerRef,
    paneCount,
    paneLayoutRevision,
    paneTitles,
    renamingPaneId,
    sessionRestoredBannerPaneIds,
    shouldMeasureHiddenStartup
  ])

  const syncOverlayRects = useEventCallback((): void => {
    const manager = managerRef.current
    const container = containerRef.current
    if (!manager || !container) {
      setPaneTitleOverlayRects({})
      return
    }
    const containerRect = container.getBoundingClientRect()
    const nextRects: Record<number, PaneTitleOverlayRect> = {}
    for (const pane of manager.getPanes()) {
      const paneRect = pane.container.getBoundingClientRect()
      if (paneRect.width > 0 && paneRect.height > 0) {
        nextRects[pane.id] = {
          left: paneRect.left - containerRect.left,
          top: paneRect.top - containerRect.top,
          width: paneRect.width
        }
      }
    }
    setPaneTitleOverlayRects((current) =>
      overlayRectsEqual(current, nextRects) ? current : nextRects
    )
  })

  useLayoutEffect(() => {
    const manager = managerRef.current
    const container = containerRef.current
    if (!manager || !container) {
      setPaneTitleOverlayRects({})
      return
    }
    let frame: number | null = null
    const scheduleSync = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(() => {
        frame = null
        syncOverlayRects()
      })
    }
    syncOverlayRects()
    const resizeObserver = new ResizeObserver(scheduleSync)
    resizeObserver.observe(container)
    for (const pane of manager.getPanes()) {
      resizeObserver.observe(pane.container)
    }
    return () => {
      resizeObserver.disconnect()
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
    }
  }, [
    containerRef,
    expandedPaneId,
    isVisible,
    managerRef,
    paneCount,
    paneLayoutRevision,
    paneTitles,
    renamingPaneId,
    sessionRestoredBannerPaneIds,
    syncOverlayRects
  ])

  useEffect(() => {
    const manager = managerRef.current
    if (manager) {
      setSessionRestoredBannerPaneIds((current) =>
        pruneSessionRestoredBannerPaneIds(current, manager.getPanes())
      )
    }
  }, [managerRef, paneCount])

  return {
    clearSessionRestoredBannerForPane,
    paneTitleOverlayRects,
    sessionRestoredBannerPaneIds,
    showRestoredSessionBanner
  }
}
