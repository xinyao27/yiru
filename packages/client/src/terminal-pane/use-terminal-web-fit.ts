import { useEffect } from 'react'
import { usesBrowserUiRenderer } from '~renderer/runtime/renderer-host'

import { isPtyLocked } from './pane-manager/mobile-driver-state'
import { getFitOverrideForPty } from './pane-manager/mobile-fit-overrides'
import type { PaneManager } from './pane-manager/pane-manager'
import { safeFitAndThen } from './pane-manager/pane-tree-ops'
import type { PtyTransport } from './pty/transport-types'

type TerminalWebFitInput = {
  isActive: boolean
  isVisible: boolean
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
}

export function useTerminalWebFit({
  isActive,
  isVisible,
  managerRef,
  paneTransportsRef
}: TerminalWebFitInput): void {
  useEffect(() => {
    if (!usesBrowserUiRenderer() || !isVisible || !isActive) {
      return
    }
    const cleanups: (() => void)[] = []
    const fitAndForward = (): void => {
      const manager = managerRef.current
      if (!manager) {
        return
      }
      for (const pane of manager.getPanes()) {
        safeFitAndThen(pane, 'web-client-pty-resize', () => {
          const transport = paneTransportsRef.current.get(pane.id)
          const ptyId = transport?.isConnected() ? transport.getPtyId() : null
          if (
            !transport ||
            !ptyId ||
            getFitOverrideForPty(ptyId) ||
            isPtyLocked(ptyId) ||
            pane.terminal.cols < 8 ||
            pane.terminal.rows < 4
          ) {
            return
          }
          if (!transport.claimViewport?.(pane.terminal.cols, pane.terminal.rows)) {
            transport.resize(pane.terminal.cols, pane.terminal.rows, { claim: true })
          }
        })
      }
    }
    const scheduleFrame = (): void => {
      const frameId = requestAnimationFrame(fitAndForward)
      cleanups.push(() => cancelAnimationFrame(frameId))
    }
    const scheduleTimer = (delayMs: number): void => {
      const timerId = window.setTimeout(fitAndForward, delayMs)
      cleanups.push(() => window.clearTimeout(timerId))
    }
    scheduleFrame()
    for (const delayMs of [50, 150, 400, 900]) {
      scheduleTimer(delayMs)
    }
    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [isActive, isVisible, managerRef, paneTransportsRef])
}
