import type React from 'react'
import { useCallback } from 'react'

import {
  buildCmdJQuickActionContext,
  type CmdJActiveGroupSnapshot
} from '@/components/cmd-j/quick-action-context'
import { runWorktreeDelete } from '@/components/sidebar/delete-worktree-flow'
import {
  getComposerEligibleRepos,
  resolveComposerGitRepoId
} from '@/components/worktree-jump-palette/new-workspace-composer-repo'
import { useAppStore } from '@/store'

import type { PaletteStoreState } from './use-palette-store-state'

type QuickActionContextInput = Pick<
  PaletteStoreState,
  | 'openModal'
  | 'openSettingsPage'
  | 'openSettingsTarget'
  | 'openNewBrowserTabInActiveWorkspace'
  | 'openNewMarkdownInActiveWorkspace'
  | 'openNewTerminalTabInActiveWorkspace'
> & {
  activeGroupSnapshotRef: React.RefObject<CmdJActiveGroupSnapshot | null>
}

function getComposerPrefetchRepoId(
  state: ReturnType<typeof useAppStore.getState>,
  initialRepoId?: string
): string | null {
  return resolveComposerGitRepoId({
    eligibleRepos: getComposerEligibleRepos(state.repos),
    initialRepoId,
    activeRepoId: state.activeRepoId,
    focusedHostScope: state.workspaceHostScope
  })
}

// Why: the quick-action context (what a Cmd+J action is allowed to do right
// now) is rebuilt fresh on selection as well as on every render for
// availability filtering — centralizing its builder keeps both call sites
// reading the exact same snapshot logic.
export function useQuickActionContext(input: QuickActionContextInput) {
  const {
    openModal,
    openSettingsPage,
    openSettingsTarget,
    openNewBrowserTabInActiveWorkspace,
    openNewMarkdownInActiveWorkspace,
    openNewTerminalTabInActiveWorkspace,
    activeGroupSnapshotRef
  } = input

  const prefetchCreateWorkspaceBaseForComposer = useCallback((initialRepoId?: string): void => {
    const state = useAppStore.getState()
    const repoIdForComposer = getComposerPrefetchRepoId(state, initialRepoId)
    if (!repoIdForComposer) {
      return
    }
    void state.prefetchWorktreeCreateBase(repoIdForComposer)
  }, [])

  const openCreateWorkspaceAction = useCallback(() => {
    prefetchCreateWorkspaceBaseForComposer()
    queueMicrotask(() =>
      openModal('new-workspace-composer', { telemetrySource: 'command_palette' })
    )
  }, [openModal, prefetchCreateWorkspaceBaseForComposer])

  const deleteActiveWorkspaceAction = useCallback(() => {
    const { activeView, activeWorktreeId } = useAppStore.getState()
    if (activeView !== 'terminal' || !activeWorktreeId) {
      return
    }
    // Why: the delete confirmation is also a modal; let the palette close
    // before mounting it so Radix focus teardown cannot fight the new dialog.
    queueMicrotask(() => runWorktreeDelete(activeWorktreeId))
  }, [])

  const openAddQuickCommandAction = useCallback(() => {
    openSettingsTarget({ pane: 'quick-commands', repoId: null, intent: 'add-quick-command' })
    openSettingsPage()
  }, [openSettingsPage, openSettingsTarget])

  const buildQuickActionContext = useCallback(
    () =>
      buildCmdJQuickActionContext({
        state: useAppStore.getState(),
        activeGroupSnapshot: activeGroupSnapshotRef.current,
        openNewBrowserTab: openNewBrowserTabInActiveWorkspace,
        openNewMarkdownFile: openNewMarkdownInActiveWorkspace,
        openNewTerminalTab: openNewTerminalTabInActiveWorkspace,
        openCreateWorkspace: openCreateWorkspaceAction,
        deleteActiveWorkspace: deleteActiveWorkspaceAction,
        openAddQuickCommand: openAddQuickCommandAction
      }),
    [
      activeGroupSnapshotRef,
      deleteActiveWorkspaceAction,
      openAddQuickCommandAction,
      openCreateWorkspaceAction,
      openNewBrowserTabInActiveWorkspace,
      openNewMarkdownInActiveWorkspace,
      openNewTerminalTabInActiveWorkspace
    ]
  )

  const quickActionContext = buildQuickActionContext()

  return { prefetchCreateWorkspaceBaseForComposer, buildQuickActionContext, quickActionContext }
}
