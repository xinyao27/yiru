import { useCallback } from 'react'
import { buildDuplicatedBrowserTabOptions } from '~renderer/lib/duplicate-browser-tab-options'
import { focusTerminalTabSurface } from '~renderer/lib/focus-terminal-tab-surface'
import { openMobileEmulatorTab } from '~renderer/lib/open-mobile-emulator-tab'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { browserWorkspaceHasRemoteOwner } from '~renderer/runtime/remote-browser-tab-ownership'
import {
  createWebRuntimeSessionBrowserTab,
  createWebRuntimeSessionTerminal
} from '~renderer/runtime/web-runtime-session'
import { useAppStore } from '~renderer/store'
import type { TerminalTab } from '~shared/types'

import { openTabBarEntry, type TabCreateEntryArgs } from '../tab-bar/tab-create-entry-action'
import { ensureSimulatorTab, getSimulatorTabForWorktree } from './ensure-simulator-tab'

export function recordTerminalTabGroupSplit(createdTerminal: TerminalTab | null | undefined): void {
  if (createdTerminal) {
    useAppStore.getState().recordFeatureInteraction('terminal-pane-split')
  }
}

export function useWorkspaceOpenCommands({
  groupId,
  mobileEmulatorEnabled,
  worktreeId
}: {
  groupId: string
  mobileEmulatorEnabled: boolean
  worktreeId: string
}) {
  const focusGroup = useAppStore((state) => state.focusGroup)
  const createTab = useAppStore((state) => state.createTab)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const setActiveTabType = useAppStore((state) => state.setActiveTabType)
  const createBrowserTab = useAppStore((state) => state.createBrowserTab)
  const createEmptySplitGroup = useAppStore((state) => state.createEmptySplitGroup)
  const openNewBrowserTabInActiveWorkspace = useAppStore(
    (state) => state.openNewBrowserTabInActiveWorkspace
  )
  const openNewMarkdownInActiveWorkspace = useAppStore(
    (state) => state.openNewMarkdownInActiveWorkspace
  )
  const openNewTerminalTabInActiveWorkspace = useAppStore(
    (state) => state.openNewTerminalTabInActiveWorkspace
  )

  const createSplitGroup = useCallback(
    (direction: 'left' | 'right' | 'up' | 'down') => {
      focusGroup(worktreeId, groupId)
      const newGroupId = createEmptySplitGroup(worktreeId, groupId, direction)
      if (!newGroupId) {
        return
      }
      // Why: this tab-strip control always seeds a terminal; drag-and-drop is
      // the separate path for opening other content in arbitrary directions.
      const terminal = createTab(worktreeId, newGroupId)
      recordTerminalTabGroupSplit(terminal)
      setActiveTab(terminal.id)
      setActiveTabType('terminal')
    },
    [
      createEmptySplitGroup,
      createTab,
      focusGroup,
      groupId,
      setActiveTab,
      setActiveTabType,
      worktreeId
    ]
  )
  const duplicateBrowserTab = useCallback(
    (browserTabId: string) => {
      void (async () => {
        const state = useAppStore.getState()
        const source = (state.browserTabsByWorktree[worktreeId] ?? []).find(
          (tab) => tab.id === browserTabId
        )
        if (!source) {
          return
        }
        const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
        if (
          browserWorkspaceHasRemoteOwner(state, source.id, environmentId) &&
          (await createWebRuntimeSessionBrowserTab({
            worktreeId,
            environmentId,
            url: source.url,
            profileId: source.sessionProfileId,
            targetGroupId: groupId
          }))
        ) {
          return
        }
        createBrowserTab(worktreeId, source.url, {
          ...buildDuplicatedBrowserTabOptions(source),
          targetGroupId: groupId
        })
      })()
    },
    [createBrowserTab, groupId, worktreeId]
  )
  const newTerminalWithShell = useCallback(
    (shellOverride: string) => {
      void (async () => {
        if (
          await createWebRuntimeSessionTerminal({
            worktreeId,
            environmentId: getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId),
            targetGroupId: groupId,
            command: shellOverride,
            activate: true
          })
        ) {
          return
        }
        const terminal = createTab(worktreeId, groupId, shellOverride)
        setActiveTab(terminal.id)
        setActiveTabType('terminal')
        focusTerminalTabSurface(terminal.id)
      })()
    },
    [createTab, groupId, setActiveTab, setActiveTabType, worktreeId]
  )
  const newSimulatorTab = useCallback(() => {
    if (getSimulatorTabForWorktree(worktreeId)) {
      void ensureSimulatorTab(worktreeId, { surfacePane: true })
      return
    }
    // Why: a mobile simulator is most useful beside the current group.
    void openMobileEmulatorTab(worktreeId, { placement: 'rightSplit', targetGroupId: groupId })
  }, [groupId, worktreeId])
  const openEntry = useCallback(async (args: TabCreateEntryArgs) => {
    await openTabBarEntry(args)
  }, [])
  const newBrowserTab = useCallback(() => {
    void openNewBrowserTabInActiveWorkspace(groupId)
  }, [groupId, openNewBrowserTabInActiveWorkspace])
  // Why: these actions target their owning group explicitly because keyboard
  // activation can open the menu before global group focus changes.
  const newFileTab = useCallback(async () => {
    await openNewMarkdownInActiveWorkspace(groupId)
  }, [groupId, openNewMarkdownInActiveWorkspace])
  const newTerminalTab = useCallback(() => {
    void openNewTerminalTabInActiveWorkspace(groupId)
  }, [groupId, openNewTerminalTabInActiveWorkspace])

  return {
    createSplitGroup,
    duplicateBrowserTab,
    newBrowserTab,
    newFileTab,
    newSimulatorTab: mobileEmulatorEnabled ? newSimulatorTab : undefined,
    newTerminalTab,
    newTerminalWithShell,
    openEntry
  }
}
