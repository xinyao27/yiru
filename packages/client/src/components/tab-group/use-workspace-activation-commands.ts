import { useCallback } from 'react'
import { TOGGLE_TERMINAL_PANE_EXPAND_EVENT } from '~renderer/constants/terminal'
import { focusTerminalTabSurface } from '~renderer/lib/focus-terminal-tab-surface'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { browserWorkspaceHasRemoteOwner } from '~renderer/runtime/remote-browser-tab-ownership'
import {
  activateWebRuntimeSessionTab,
  isWebRuntimeSessionActive
} from '~renderer/runtime/web-runtime-session'
import { useAppStore } from '~renderer/store'
import type { Tab } from '~shared/types'

type TerminalLayoutsByTabId = NonNullable<
  ReturnType<typeof useAppStore.getState>['terminalLayoutsByTabId']
>

export function useWorkspaceActivationCommands({
  groupId,
  groupTabs,
  terminalLayoutsByTabId,
  worktreeId
}: {
  groupId: string
  groupTabs: readonly Tab[]
  terminalLayoutsByTabId: TerminalLayoutsByTabId
  worktreeId: string
}) {
  const focusGroup = useAppStore((state) => state.focusGroup)
  const activateTab = useAppStore((state) => state.activateTab)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const setActiveFile = useAppStore((state) => state.setActiveFile)
  const setActiveTabType = useAppStore((state) => state.setActiveTabType)
  const setActiveBrowserTab = useAppStore((state) => state.setActiveBrowserTab)

  const activateTerminal = useCallback(
    (terminalId: string) => {
      const item = groupTabs.find(
        (candidate) => candidate.entityId === terminalId && candidate.contentType === 'terminal'
      )
      if (!item) {
        return
      }
      focusGroup(worktreeId, groupId)
      activateTab(item.id)
      const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
      if (isWebRuntimeSessionActive(environmentId)) {
        void activateWebRuntimeSessionTab({ worktreeId, tabId: terminalId, environmentId })
      }
      setActiveTab(terminalId)
      setActiveTabType('terminal')
      const activeLeafId = terminalLayoutsByTabId[terminalId]?.activeLeafId ?? null
      // Why: activation must restore xterm focus to the store-active leaf so
      // keyboard input cannot drift to a sibling pane.
      focusTerminalTabSurface(terminalId, activeLeafId)
    },
    [
      activateTab,
      focusGroup,
      groupId,
      groupTabs,
      setActiveTab,
      setActiveTabType,
      terminalLayoutsByTabId,
      worktreeId
    ]
  )
  const toggleTerminalPaneExpand = useCallback(
    (terminalId: string) => {
      const item = groupTabs.find(
        (candidate) => candidate.entityId === terminalId && candidate.contentType === 'terminal'
      )
      if (!item) {
        return
      }
      // Why: the collapse icon stops pointer propagation and therefore does
      // not run normal tab activation before toggling pane layout.
      activateTerminal(terminalId)
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, { detail: { tabId: terminalId } })
        )
      })
    },
    [activateTerminal, groupTabs]
  )
  const activateEditor = useCallback(
    (tabId: string) => {
      const item = groupTabs.find((candidate) => candidate.id === tabId)
      if (!item) {
        return
      }
      focusGroup(worktreeId, groupId)
      activateTab(item.id)
      if (item.contentType === 'simulator') {
        setActiveTabType('simulator')
      } else {
        setActiveFile(item.entityId)
        setActiveTabType('editor')
      }
    },
    [activateTab, focusGroup, groupId, groupTabs, setActiveFile, setActiveTabType, worktreeId]
  )
  const activateBrowser = useCallback(
    (browserTabId: string) => {
      const item = groupTabs.find(
        (candidate) => candidate.entityId === browserTabId && candidate.contentType === 'browser'
      )
      if (!item) {
        return
      }
      focusGroup(worktreeId, groupId)
      activateTab(item.id)
      const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
      if (
        isWebRuntimeSessionActive(environmentId) &&
        browserWorkspaceHasRemoteOwner(useAppStore.getState(), browserTabId, environmentId)
      ) {
        void activateWebRuntimeSessionTab({ worktreeId, tabId: item.id, environmentId })
      }
      setActiveBrowserTab(browserTabId)
      setActiveTabType('browser')
    },
    [activateTab, focusGroup, groupId, groupTabs, setActiveBrowserTab, setActiveTabType, worktreeId]
  )
  const activateGitGraph = useCallback(
    (tabId: string) => {
      const item = groupTabs.find(
        (candidate) => candidate.id === tabId && candidate.contentType === 'git-graph'
      )
      if (!item) {
        return
      }
      focusGroup(worktreeId, groupId)
      activateTab(item.id)
      setActiveTabType('editor')
    },
    [activateTab, focusGroup, groupId, groupTabs, setActiveTabType, worktreeId]
  )

  return {
    activateBrowser,
    activateEditor,
    activateGitGraph,
    activateTerminal,
    focusGroup: () => focusGroup(worktreeId, groupId),
    toggleTerminalPaneExpand
  }
}
