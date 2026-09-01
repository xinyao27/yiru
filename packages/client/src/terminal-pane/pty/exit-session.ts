import { scheduleRuntimeGraphSync } from '~renderer/runtime/sync-runtime-graph'
import { useAppStore } from '~renderer/store/state'

import type { PtyTransport } from './transport-types'

type ExitSessionOptions = {
  paneKey: string
  paneId: number
  tabId: string
  getTransport: () => PtyTransport
  getCurrentPaneTransport: () => PtyTransport | undefined
  getPaneCount: () => number
  getIsVisible: () => boolean
  getHadExistingPaneTransport: () => boolean
  getRestoredPtyId: () => string | null
  getLastInputAt: () => number
  getHasReceivedOutput: () => boolean
  resetOutputSequence: (ptyId: string) => void
  disposeProcessTracking: () => void
  dropSideEffectFacts: () => void
  clearPaneBinding: () => void
  resetKeyboardModes: () => void
  consumeSuppressedExit: (ptyId: string) => boolean
  clearExitedLayoutBinding: (ptyId: string) => void
  clearRuntimeTitle: () => void
  clearTabPtyId: (ptyId: string) => void
  setCacheTimerStartedAt: (timestamp: number | null) => void
  setGpuRendering: (enabled: boolean) => void
  armHibernatedWake: (ptyId: string) => boolean
  resetFrozenTerminalModes: () => void
  exitSolePane: (ptyId: string) => void
  focusSurvivingPane: () => void
  closePane: () => void
}

export type ExitSession = {
  onExit: (ptyId: string) => void
  markFreshSpawn: (ptyId: string) => void
  hasHandled: (ptyId: string) => boolean
}

export function createExitSession(options: ExitSessionOptions): ExitSession {
  let handledPtyId: string | null = null
  let freshSpawnedPtyId: string | null = null
  const onExit = (ptyId: string): void => {
    if (handledPtyId === ptyId) {
      return
    }
    options.resetOutputSequence(ptyId)
    const currentTransport = options.getCurrentPaneTransport()
    if (currentTransport && currentTransport !== options.getTransport()) {
      // Why: a replaced transport can report a late exit; clear only the old
      // PTY's tab ownership and leave the replacement pane intact.
      handledPtyId = ptyId
      options.clearTabPtyId(ptyId)
      options.consumeSuppressedExit(ptyId)
      scheduleRuntimeGraphSync()
      return
    }
    handledPtyId = ptyId
    options.disposeProcessTracking()
    options.dropSideEffectFacts()
    options.clearPaneBinding()
    options.resetKeyboardModes()
    const isSuppressedExit = options.consumeSuppressedExit(ptyId)
    if (!isSuppressedExit) {
      options.clearExitedLayoutBinding(ptyId)
    }
    options.clearRuntimeTitle()
    options.clearTabPtyId(ptyId)
    options.setCacheTimerStartedAt(null)
    useAppStore.getState().removeAgentStatus(options.paneKey)
    useAppStore.getState().clearPaneForegroundAgent(options.paneKey)
    scheduleRuntimeGraphSync()
    if (isSuppressedExit) {
      options.setGpuRendering(true)
      if (options.armHibernatedWake(ptyId)) {
        options.resetFrozenTerminalModes()
      }
      return
    }
    options.setGpuRendering(true)
    if (options.getPaneCount() <= 1) {
      // Why: preserve the diagnostic frame of a newborn sole shell that died
      // before input; explicit exits and dead reattaches still close normally.
      if (freshSpawnedPtyId === ptyId && !Number.isFinite(options.getLastInputAt())) {
        return
      }
      options.exitSolePane(ptyId)
      return
    }
    if (
      options.getIsVisible() &&
      options.getHadExistingPaneTransport() &&
      !options.getRestoredPtyId() &&
      !Number.isFinite(options.getLastInputAt()) &&
      !options.getHasReceivedOutput()
    ) {
      // Why: preserve a visible newborn split that failed during setup, while
      // hidden binding-less panes must close instead of remounting as ghosts.
      options.focusSurvivingPane()
      return
    }
    options.closePane()
  }

  return {
    onExit,
    markFreshSpawn: (ptyId) => {
      freshSpawnedPtyId = ptyId
    },
    hasHandled: (ptyId) => handledPtyId === ptyId
  }
}
