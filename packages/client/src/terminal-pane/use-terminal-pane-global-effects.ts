import { useEffect, useRef } from 'react'
import {
  FOCUS_TERMINAL_PANE_EVENT,
  PASTE_TERMINAL_TEXT_EVENT,
  TOGGLE_TERMINAL_PANE_EXPAND_EVENT,
  type FocusTerminalPaneDetail,
  type PasteTerminalTextDetail
} from '~renderer/constants/terminal'
import { useAppStore } from '~renderer/store/state'
import type { PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'

import { handleFocusTerminalPaneDetail } from './focus-terminal-pane-event'
import type { PtyTransport } from './pty/transport-types'
import { surfaceStaleAgentRow } from './stale-agent-row'
import { handleTerminalProgrammaticTextPaste } from './terminal-programmatic-text-paste'
import {
  hideTerminalVisibility,
  resumeTerminalVisibility,
  type TerminalHiddenReason
} from './terminal-visibility-resume'
import { useTerminalContainerFitSync } from './use-terminal-container-fit-sync'
import { useTerminalScrollVisibilityMemory } from './use-terminal-scroll-visibility-memory'
import { useTerminalWindowWakeRecovery } from './use-terminal-window-wake-recovery'

type UseTerminalPaneGlobalEffectsArgs = {
  tabId: string
  worktreeId: string
  cwd?: string
  isActive: boolean
  isVisible: boolean
  isWorktreeActive?: boolean
  isSyncFitEnabled: boolean
  paneCount: number
  managerRef: React.RefObject<PaneManager | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  isActiveRef: React.RefObject<boolean>
  isVisibleRef: React.RefObject<boolean>
  toggleExpandPane: (paneId: number) => void
}

function reportRendererPtyVisibility(
  paneTransports: ReadonlyMap<number, PtyTransport>,
  visible: boolean,
  active: boolean
): void {
  for (const transport of paneTransports.values()) {
    transport.setDeliveryState?.({
      visible,
      interested: visible,
      priority: visible ? (active ? 'active' : 'visible') : 'parked'
    })
  }
}

export function useTerminalPaneGlobalEffects({
  tabId,
  worktreeId,
  isActive,
  isVisible,
  isWorktreeActive = isVisible,
  isSyncFitEnabled,
  paneCount,
  managerRef,
  containerRef,
  paneTransportsRef,
  isActiveRef,
  isVisibleRef,
  toggleExpandPane
}: UseTerminalPaneGlobalEffectsArgs): void {
  // Starts true so the first render with isVisible=false triggers a
  // suspendRendering(). Background worktrees that mount hidden would
  // otherwise leak WebGL contexts — openTerminal() unconditionally creates
  // one — and exhaust Chromium's ~8-context budget across worktrees.
  const wasVisibleRef = useRef(true)
  const wasWorktreeActiveRef = useRef(isWorktreeActive)
  const hasCompletedVisibleResumeRef = useRef(false)
  const renderingSuspendedByVisibilityRef = useRef(false)
  const hiddenReasonRef = useRef<TerminalHiddenReason | null>(null)
  const rendererVisible = isVisible && isWorktreeActive
  const {
    captureViewportPositions,
    withSuppressedScrollTracking,
    applyPendingFollowOutputRequests,
    scheduleFollowOutputIfNeeded
  } = useTerminalScrollVisibilityMemory({
    managerRef,
    isVisibleRef,
    visibleResumeCompleteRef: wasVisibleRef,
    paneCount
  })
  useTerminalContainerFitSync({
    isVisible: rendererVisible,
    isSyncFitEnabled,
    managerRef,
    containerRef
  })
  useTerminalWindowWakeRecovery({
    isVisible: rendererVisible,
    managerRef,
    isActiveRef,
    isVisibleRef
  })

  useEffect(() => {
    const paneTransports = paneTransportsRef.current
    reportRendererPtyVisibility(paneTransports, rendererVisible, isActive)
    return () => {
      for (const transport of paneTransports.values()) {
        transport.setDeliveryState?.({ visible: false, interested: false, priority: 'parked' })
      }
    }
  }, [isActive, rendererVisible, paneTransportsRef])

  useEffect(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    const wasVisible = wasVisibleRef.current
    const wasWorktreeActive = wasWorktreeActiveRef.current
    isActiveRef.current = isActive
    isVisibleRef.current = rendererVisible
    if (rendererVisible) {
      const shouldUseLightTabResume =
        isWorktreeActive &&
        hasCompletedVisibleResumeRef.current &&
        !renderingSuspendedByVisibilityRef.current &&
        (wasVisible || hiddenReasonRef.current === 'tab')
      resumeTerminalVisibility({
        manager,
        isActive,
        wasVisible,
        shouldUseLightTabResume,
        captureViewportPositions,
        withSuppressedScrollTracking
      })
      renderingSuspendedByVisibilityRef.current = false
      wasVisibleRef.current = true
      wasWorktreeActiveRef.current = isWorktreeActive
      hasCompletedVisibleResumeRef.current = true
      hiddenReasonRef.current = null
      applyPendingFollowOutputRequests()
      return
    } else {
      const hiddenState = hideTerminalVisibility({
        manager,
        wasVisible,
        wasWorktreeActive,
        isWorktreeActive,
        hasCompletedVisibleResume: hasCompletedVisibleResumeRef.current,
        captureViewportPositions
      })
      renderingSuspendedByVisibilityRef.current = hiddenState.renderingSuspended
      hiddenReasonRef.current = hiddenState.hiddenReason
    }
    wasVisibleRef.current = false
    wasWorktreeActiveRef.current = isWorktreeActive
  }, [
    applyPendingFollowOutputRequests,
    captureViewportPositions,
    isActive,
    isActiveRef,
    isVisibleRef,
    isWorktreeActive,
    managerRef,
    rendererVisible,
    withSuppressedScrollTracking
  ])

  useEffect(() => {
    const onToggleExpand = (event: Event): void => {
      const detail = (event as CustomEvent<{ tabId?: string }>).detail
      if (!detail?.tabId || detail.tabId !== tabId) {
        return
      }
      const manager = managerRef.current
      if (!manager) {
        return
      }
      const panes = manager.getPanes()
      if (panes.length < 2) {
        return
      }
      const pane = manager.getActivePane() ?? panes[0]
      if (!pane) {
        return
      }
      toggleExpandPane(pane.id)
    }
    window.addEventListener(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, onToggleExpand)
    return () => window.removeEventListener(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, onToggleExpand)
  }, [managerRef, tabId, toggleExpandPane])

  useEffect(() => {
    const onFocusPane = (event: Event): void => {
      const detail = (event as CustomEvent<FocusTerminalPaneDetail | undefined>).detail
      handleFocusTerminalPaneDetail(detail, {
        tabId,
        manager: managerRef.current,
        acknowledgeAgents: (paneKeys) => useAppStore.getState().acknowledgeAgents(paneKeys),
        surfaceStaleAgentRow,
        scrollToBottomIfOutputSinceLastView: scheduleFollowOutputIfNeeded
      })
    }
    window.addEventListener(FOCUS_TERMINAL_PANE_EVENT, onFocusPane)
    return () => window.removeEventListener(FOCUS_TERMINAL_PANE_EVENT, onFocusPane)
  }, [tabId, managerRef, scheduleFollowOutputIfNeeded])

  useEffect(() => {
    const onPasteText = (event: Event): void => {
      const detail = (event as CustomEvent<PasteTerminalTextDetail | undefined>).detail
      handleTerminalProgrammaticTextPaste({
        detail,
        tabId,
        worktreeId,
        getManager: () => managerRef.current,
        getPaneTransports: () => paneTransportsRef.current
      })
    }
    window.addEventListener(PASTE_TERMINAL_TEXT_EVENT, onPasteText)
    return () => window.removeEventListener(PASTE_TERMINAL_TEXT_EVENT, onPasteText)
  }, [managerRef, paneTransportsRef, tabId, worktreeId])
}
