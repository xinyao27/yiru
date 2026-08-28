import { useEffect, useState } from 'react'

import { applyDesktopFitFallbackAfterReplay } from './desktop-fit-fallback'
import { getOverrideAffectedPanes, getPanesNeedingOverrideFit } from './override-affected-panes'
import { onDriverChange } from './pane-manager/mobile-driver-state'
import { onOverrideChange } from './pane-manager/mobile-fit-overrides'
import type { PaneManager } from './pane-manager/pane-manager'
import { safeFit } from './pane-manager/pane-tree-ops'
import type { PtyTransport } from './pty/transport-types'

type TerminalMobileFitInput = {
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
}

export function useTerminalMobileFit({
  managerRef,
  paneTransportsRef
}: TerminalMobileFitInput): () => void {
  const [, setOverrideRevision] = useState(0)
  useEffect(() => {
    const pendingFitFrames = new Set<number>()
    const pendingFallbackTimers = new Set<number>()
    const scheduleFitFrame = (callback: () => void): void => {
      const frameId = window.requestAnimationFrame(() => {
        pendingFitFrames.delete(frameId)
        callback()
      })
      pendingFitFrames.add(frameId)
    }
    const scheduleFallbackTimer = (callback: () => void): void => {
      const timerId = window.setTimeout(() => {
        pendingFallbackTimers.delete(timerId)
        callback()
      }, 100)
      pendingFallbackTimers.add(timerId)
    }

    const unsubscribe = onOverrideChange((event) => {
      setOverrideRevision((revision) => revision + 1)
      const manager = managerRef.current
      if (!manager) {
        return
      }
      const getAffectedPanes = (): ReturnType<typeof manager.getPanes> =>
        getOverrideAffectedPanes(
          manager.getPanes(),
          (paneId) => paneTransportsRef.current.get(paneId)?.getPtyId(),
          event.ptyId
        )
      if (event.mode === 'mobile-fit' || event.mode === 'remote-desktop-fit') {
        if (getPanesNeedingOverrideFit(getAffectedPanes(), event.cols, event.rows).length === 0) {
          return
        }
        scheduleFitFrame(() => {
          for (const pane of getPanesNeedingOverrideFit(
            getAffectedPanes(),
            event.cols,
            event.rows
          )) {
            safeFit(pane)
          }
        })
        return
      }
      if (event.mode === 'desktop-fit') {
        scheduleFitFrame(() => {
          for (const pane of getAffectedPanes()) {
            safeFit(pane)
          }
        })
        scheduleFallbackTimer(() => {
          for (const pane of getAffectedPanes()) {
            const rect = pane.container.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) {
              continue
            }
            applyDesktopFitFallbackAfterReplay(pane, {
              ...event,
              shouldApply: () => getAffectedPanes().includes(pane)
            })
          }
        })
      }
    })

    return () => {
      unsubscribe()
      for (const frameId of pendingFitFrames) {
        window.cancelAnimationFrame(frameId)
      }
      for (const timerId of pendingFallbackTimers) {
        window.clearTimeout(timerId)
      }
    }
  }, [managerRef, paneTransportsRef])

  const [, setDriverRevision] = useState(0)
  useEffect(
    () =>
      onDriverChange(() => {
        setDriverRevision((revision) => revision + 1)
      }),
    []
  )
  return () => setOverrideRevision((revision) => revision + 1)
}
