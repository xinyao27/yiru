import type React from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  buildCmdJQuickActionContext,
  findCoworkingOwnerWorktree,
  type CmdJActiveGroupSnapshot
} from '~renderer/components/cmd-j/quick-action-context'
import {
  getComposerEligibleRepos,
  resolveComposerGitRepoId
} from '~renderer/components/worktree-jump-palette/new-workspace-composer-repo'
import { useAppStore } from '~renderer/store'
import { findWorktreeById } from '~renderer/store/slices/worktree-helpers'

import { runWorktreeDelete } from '../sidebar/delete-worktree/flow'
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

export type CoworkingPublicationDialogState = {
  worktreeId: string
  worktreeName: string
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
  const [coworkingPublicationDialog, setCoworkingPublicationDialog] =
    useState<CoworkingPublicationDialogState | null>(null)
  const coworkingVisibilityUpdateInFlightRef = useRef(false)

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

  const openCoworkingSettingsAction = useCallback(() => {
    openSettingsTarget({ pane: 'coworking', repoId: null })
    openSettingsPage()
  }, [openSettingsPage, openSettingsTarget])

  const toggleCoworkingVisibilityAction = useCallback(async (): Promise<void> => {
    const state = useAppStore.getState()
    const activeWorktreeId = state.activeWorktreeId
    const ownerWorktree = findCoworkingOwnerWorktree(
      state.coworkingOwnerWorktrees,
      activeWorktreeId
    )
    if (!ownerWorktree) {
      return
    }
    if (ownerWorktree.visibility === 'private') {
      const activeWorktree = activeWorktreeId
        ? findWorktreeById(state.worktreesByRepo, activeWorktreeId)
        : null
      if (!activeWorktree) {
        return
      }
      setCoworkingPublicationDialog({
        worktreeId: activeWorktree.id,
        worktreeName: activeWorktree.displayName || activeWorktree.branch || activeWorktree.id
      })
      return
    }
    if (coworkingVisibilityUpdateInFlightRef.current) {
      return
    }
    coworkingVisibilityUpdateInFlightRef.current = true
    try {
      await window.api.coworkingSharing.setWorktreeVisibility({
        worktreeId: ownerWorktree.worktreeId,
        visibility: 'private'
      })
    } finally {
      coworkingVisibilityUpdateInFlightRef.current = false
    }
  }, [])

  const closeCoworkingPublicationDialog = useCallback(() => {
    setCoworkingPublicationDialog(null)
  }, [])

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
        openAddQuickCommand: openAddQuickCommandAction,
        openCoworkingSettings: openCoworkingSettingsAction,
        toggleCoworkingVisibility: toggleCoworkingVisibilityAction
      }),
    [
      activeGroupSnapshotRef,
      deleteActiveWorkspaceAction,
      openAddQuickCommandAction,
      openCoworkingSettingsAction,
      openCreateWorkspaceAction,
      openNewBrowserTabInActiveWorkspace,
      openNewMarkdownInActiveWorkspace,
      openNewTerminalTabInActiveWorkspace,
      toggleCoworkingVisibilityAction
    ]
  )

  const quickActionContext = buildQuickActionContext()

  return {
    buildQuickActionContext,
    closeCoworkingPublicationDialog,
    coworkingPublicationDialog,
    prefetchCreateWorkspaceBaseForComposer,
    quickActionContext
  }
}
