import type { PtyConnectionDeps } from './pty/connection-types'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type TerminalPanePtyDepsInput = {
  deps: UseTerminalPaneLifecycleDeps
  restoredViewportBlankingPanesRef: React.RefObject<Set<number>>
  startupCwd: string
}

export function createTerminalPanePtyDeps({
  deps,
  restoredViewportBlankingPanesRef,
  startupCwd
}: TerminalPanePtyDepsInput): PtyConnectionDeps {
  const startup =
    deps.startup && deps.setupSplit
      ? { ...deps.startup, waitForSetupSplitDirection: deps.setupSplit.direction }
      : deps.startup
  return {
    tabId: deps.tabId,
    worktreeId: deps.worktreeId,
    cwd: startupCwd,
    startup,
    paneTransportsRef: deps.paneTransportsRef,
    paneMode2031Ref: deps.paneMode2031Ref,
    paneKittyKeyboardModesRef: deps.paneKittyKeyboardModesRef,
    paneLastThemeModeRef: deps.paneLastThemeModeRef,
    replayingPanesRef: deps.replayingPanesRef,
    restoredViewportBlankingPanesRef,
    isActiveRef: deps.isActiveRef,
    isVisibleRef: deps.isVisibleRef,
    onPtyExitRef: deps.onPtyExitRef,
    onPtyErrorRef: deps.onPtyErrorRef,
    clearTabPtyId: deps.clearTabPtyId,
    consumeSuppressedPtyExit: deps.consumeSuppressedPtyExit,
    updateTabTitle: deps.updateTabTitle,
    setRuntimePaneTitle: deps.setRuntimePaneTitle,
    clearRuntimePaneTitle: deps.clearRuntimePaneTitle,
    updateTabPtyId: deps.updateTabPtyId,
    markWorktreeUnread: deps.markWorktreeUnread,
    markTerminalTabUnread: deps.markTerminalTabUnread,
    markTerminalPaneUnread: deps.markTerminalPaneUnread,
    clearWorktreeUnread: deps.clearWorktreeUnread,
    clearTerminalTabUnread: deps.clearTerminalTabUnread,
    clearTerminalPaneUnread: deps.clearTerminalPaneUnread,
    onShowSessionRestoredBanner: deps.onShowSessionRestoredBanner,
    dispatchNotification: deps.dispatchNotification,
    setCacheTimerStartedAt: deps.setCacheTimerStartedAt,
    syncPanePtyLayoutBinding: deps.syncPanePtyLayoutBinding,
    clearExitedPanePtyLayoutBinding: deps.clearExitedPanePtyLayoutBinding,
    recordPaneMode2031Subscription: (paneId, repliedMode) => {
      deps.paneMode2031Ref.current.set(paneId, true)
      deps.paneLastThemeModeRef.current.set(paneId, repliedMode)
    },
    restoredPtyIdByLeafId: deps.initialLayoutRef.current.ptyIdsByLeafId ?? {}
  }
}
