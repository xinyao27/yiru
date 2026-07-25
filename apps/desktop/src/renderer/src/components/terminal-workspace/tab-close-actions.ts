import { useCallback } from 'react'

import { TOGGLE_TERMINAL_PANE_EXPAND_EVENT } from '@/constants/terminal'

import { browserWorkspaceHasRemoteOwner } from '../../runtime/remote-browser-tab-ownership'
import {
  activateWebRuntimeSessionTab,
  closeWebRuntimeSessionTab,
  isWebRuntimeSessionActive
} from '../../runtime/web-runtime-session'
import { useAppStore } from '../../store'
import { destroyWorkspaceWebviews } from '../../store/slices/browser-webview-cleanup'
import { shouldDeferParkedPtyExitTabClose } from '../terminal-pane/terminal-parked-tab-watchers'
import { closeTerminalTab } from '../terminal/tab-actions'
import { closeUnifiedTabsById } from './bulk-close-tabs'
import {
  getActiveWorktreeRuntimeEnvironmentId,
  isPinnedEditorFileTab,
  isPinnedVisibleTab
} from './tab-model-lookup'
import type { QueueEditorCloseRequests } from './window-close-guard'

type TabCloseActions = {
  handleCloseTab: (tabId: string) => void
  handleCloseBrowserTab: (tabId: string) => void
  handlePtyExit: (tabId: string, ptyId: string) => void
  handleCloseOthers: (tabId: string) => void
  handleCloseTabsToRight: (tabId: string) => void
  handleCloseAllFiles: () => void
  handleActivateTab: (tabId: string) => void
  handleTogglePaneExpand: (tabId: string) => void
  handleActivateBrowserTab: (tabId: string) => void
}

// Why: closing, activating, and bulk-closing tabs of mixed content types
// (terminal / editor / browser) all need the same web-runtime-session
// routing and unified-tab pinned-state checks, so they share one hook.
export function useTabCloseActions(
  queueEditorCloseRequests: QueueEditorCloseRequests
): TabCloseActions {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const closeTab = useAppStore((s) => s.closeTab)
  const closeFile = useAppStore((s) => s.closeFile)
  const closeBrowserTab = useAppStore((s) => s.closeBrowserTab)
  const setActiveFile = useAppStore((s) => s.setActiveFile)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const setActiveTabType = useAppStore((s) => s.setActiveTabType)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const setActiveBrowserTab = useAppStore((s) => s.setActiveBrowserTab)
  const consumeSuppressedPtyExit = useAppStore((s) => s.consumeSuppressedPtyExit)

  const handleCloseTab = useCallback((tabId: string) => {
    closeTerminalTab(tabId)
  }, [])

  const handleCloseBrowserTab = useCallback(
    (tabId: string) => {
      const state = useAppStore.getState()
      const owningWorktreeEntry = Object.entries(state.browserTabsByWorktree).find(
        ([, worktreeTabs]) => worktreeTabs.some((tab) => tab.id === tabId)
      )
      const owningWorktreeId = owningWorktreeEntry?.[0] ?? null
      if (!owningWorktreeId) {
        return
      }
      if (isPinnedVisibleTab(state, owningWorktreeId, tabId)) {
        return
      }
      const runtimeEnvironmentId = getActiveWorktreeRuntimeEnvironmentId(owningWorktreeId)
      if (
        isWebRuntimeSessionActive(runtimeEnvironmentId) &&
        browserWorkspaceHasRemoteOwner(state, tabId, runtimeEnvironmentId)
      ) {
        void closeWebRuntimeSessionTab({
          worktreeId: owningWorktreeId,
          tabId,
          environmentId: runtimeEnvironmentId
        })
        return
      }
      const currentTabs = state.browserTabsByWorktree[owningWorktreeId] ?? []
      if (currentTabs.length <= 1) {
        destroyWorkspaceWebviews(state.browserPagesByWorkspace, tabId)
        closeBrowserTab(tabId)
        if (state.activeWorktreeId === owningWorktreeId) {
          const worktreeFile = state.openFiles.find((file) => file.worktreeId === owningWorktreeId)
          if (worktreeFile) {
            setActiveFile(worktreeFile.id)
            setActiveTabType('editor')
          } else {
            const terminalTab = (state.tabsByWorktree[owningWorktreeId] ?? [])[0]
            if (terminalTab) {
              setActiveTab(terminalTab.id)
              setActiveTabType('terminal')
            } else {
              setActiveWorktree(null)
            }
          }
        }
        return
      }
      if (state.activeWorktreeId === owningWorktreeId && tabId === state.activeBrowserTabId) {
        const idx = currentTabs.findIndex((tab) => tab.id === tabId)
        const nextTab = currentTabs[idx + 1] ?? currentTabs[idx - 1]
        if (nextTab) {
          setActiveBrowserTab(nextTab.id)
        }
      }
      destroyWorkspaceWebviews(state.browserPagesByWorkspace, tabId)
      closeBrowserTab(tabId)
    },
    [
      closeBrowserTab,
      setActiveBrowserTab,
      setActiveFile,
      setActiveTab,
      setActiveTabType,
      setActiveWorktree
    ]
  )

  const handlePtyExit = useCallback(
    (tabId: string, ptyId: string) => {
      if (consumeSuppressedPtyExit(ptyId)) {
        return
      }
      // Why: a parked multi-leaf tab has no PaneManager to promote split
      // siblings, so closing the tab here would kill them; the reveal
      // remount handles dead PTYs per leaf instead.
      if (shouldDeferParkedPtyExitTabClose(tabId, ptyId)) {
        return
      }
      closeTerminalTab(tabId, { reason: 'pty-exit' })
    },
    [consumeSuppressedPtyExit]
  )

  const handleCloseOthers = useCallback(
    (tabId: string) => {
      if (!activeWorktreeId) {
        return
      }
      const state = useAppStore.getState()
      const order = state.tabBarOrderByWorktree[activeWorktreeId] ?? []
      const dirtyFileIds = closeUnifiedTabsById({
        worktreeId: activeWorktreeId,
        ids: order.filter((id) => id !== tabId),
        state,
        closeTab,
        closeFile,
        closeBrowserTab
      })
      if (dirtyFileIds.length > 0) {
        queueEditorCloseRequests(dirtyFileIds)
      }
    },
    [activeWorktreeId, closeBrowserTab, closeFile, closeTab, queueEditorCloseRequests]
  )

  const handleCloseTabsToRight = useCallback(
    (tabId: string) => {
      if (!activeWorktreeId) {
        return
      }
      const state = useAppStore.getState()
      const currentOrder = state.tabBarOrderByWorktree[activeWorktreeId] ?? []
      const index = currentOrder.indexOf(tabId)
      if (index === -1) {
        return
      }
      const dirtyFileIds = closeUnifiedTabsById({
        worktreeId: activeWorktreeId,
        ids: currentOrder.slice(index + 1),
        state,
        closeTab,
        closeFile,
        closeBrowserTab
      })
      if (dirtyFileIds.length > 0) {
        queueEditorCloseRequests(dirtyFileIds)
      }
    },
    [activeWorktreeId, closeBrowserTab, closeFile, closeTab, queueEditorCloseRequests]
  )

  const handleCloseAllFiles = useCallback(() => {
    if (!activeWorktreeId) {
      return
    }
    const state = useAppStore.getState()
    const filesInWorktree = state.openFiles.filter((file) => file.worktreeId === activeWorktreeId)
    const closableFiles = filesInWorktree.filter(
      (file) => !isPinnedEditorFileTab(state, activeWorktreeId, file.id)
    )
    const dirtyFileIds = closableFiles.filter((file) => file.isDirty).map((file) => file.id)
    for (const file of closableFiles) {
      if (!file.isDirty) {
        closeFile(file.id)
      }
    }
    if (dirtyFileIds.length > 0) {
      queueEditorCloseRequests(dirtyFileIds)
    }
  }, [activeWorktreeId, closeFile, queueEditorCloseRequests])

  const handleActivateTab = useCallback(
    (tabId: string) => {
      const runtimeEnvironmentId = getActiveWorktreeRuntimeEnvironmentId(activeWorktreeId)
      if (activeWorktreeId && isWebRuntimeSessionActive(runtimeEnvironmentId)) {
        void activateWebRuntimeSessionTab({
          worktreeId: activeWorktreeId,
          tabId,
          environmentId: runtimeEnvironmentId
        })
      }
      setActiveTab(tabId)
      setActiveTabType('terminal')
    },
    [activeWorktreeId, setActiveTab, setActiveTabType]
  )

  const handleTogglePaneExpand = useCallback(
    (tabId: string) => {
      setActiveTab(tabId)
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, {
            detail: { tabId }
          })
        )
      })
    },
    [setActiveTab]
  )

  const handleActivateBrowserTab = useCallback(
    (tabId: string) => {
      const state = useAppStore.getState()
      const runtimeEnvironmentId = getActiveWorktreeRuntimeEnvironmentId(activeWorktreeId)
      if (
        activeWorktreeId &&
        isWebRuntimeSessionActive(runtimeEnvironmentId) &&
        browserWorkspaceHasRemoteOwner(state, tabId, runtimeEnvironmentId)
      ) {
        void activateWebRuntimeSessionTab({
          worktreeId: activeWorktreeId,
          tabId,
          environmentId: runtimeEnvironmentId
        })
      }
      setActiveBrowserTab(tabId)
      setActiveTabType('browser')
    },
    [activeWorktreeId, setActiveBrowserTab, setActiveTabType]
  )

  return {
    handleCloseTab,
    handleCloseBrowserTab,
    handlePtyExit,
    handleCloseOthers,
    handleCloseTabsToRight,
    handleCloseAllFiles,
    handleActivateTab,
    handleTogglePaneExpand,
    handleActivateBrowserTab
  }
}
