import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { coworkingSharingClient } from '~renderer/runtime/coworking-sharing-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store'

import { getWorkspaceStatus } from '../workspace-status'
import type { WorktreeContextMenuState } from './state'

export function useWorkspaceMenuActions(args: {
  state: WorktreeContextMenuState
  setMenuOpenState: (open: boolean) => void
}) {
  const { state, setMenuOpenState } = args
  const { activeContextWorktrees, repo, worktree, workspaceStatuses } = state
  const updateWorktreeMeta = useAppStore((store) => store.updateWorktreeMeta)
  const setWorktreesPinnedAndReveal = useAppStore((store) => store.setWorktreesPinnedAndReveal)
  const openModal = useAppStore((store) => store.openModal)
  const createProjectGroup = useAppStore((store) => store.createProjectGroup)
  const moveProjectToGroup = useAppStore((store) => store.moveProjectToGroup)
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false)
  const [coworkingPublicationDialogOpen, setCoworkingPublicationDialogOpen] = useState(false)
  const [coworkingVisibilityPending, setCoworkingVisibilityPending] = useState(false)

  const handleCopyPath = useCallback(() => {
    shellClient.ui.writeClipboardText(worktree.path)
  }, [worktree.path])

  const handleToggleRead = useCallback(() => {
    updateWorktreeMeta(worktree.id, { isUnread: !worktree.isUnread })
  }, [updateWorktreeMeta, worktree.id, worktree.isUnread])

  const handleTogglePin = useCallback(() => {
    setWorktreesPinnedAndReveal([worktree.id], !worktree.isPinned)
  }, [setWorktreesPinnedAndReveal, worktree.id, worktree.isPinned])

  const handleCoworkingVisibility = useCallback(() => {
    if (!state.coworkingOwnerWorktree || coworkingVisibilityPending) {
      return
    }
    if (state.coworkingOwnerWorktree.visibility === 'private') {
      setCoworkingPublicationDialogOpen(true)
      return
    }
    setCoworkingVisibilityPending(true)
    void coworkingSharingClient
      .setWorktreeVisibility({ worktreeId: worktree.id, visibility: 'private' })
      .catch(() => {
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeContextMenu.coworkingPrivateFailed',
            'Could not make this worktree private.'
          )
        )
      })
      .finally(() => setCoworkingVisibilityPending(false))
  }, [coworkingVisibilityPending, state.coworkingOwnerWorktree, worktree.id])

  const handleCreateGroupFromRepo = useCallback(() => {
    if (repo) {
      setCreateGroupDialogOpen(true)
    }
  }, [repo])

  const handleSubmitNewProjectGroup = useCallback(
    async (name: string) => {
      if (!repo) {
        return
      }
      const group = await createProjectGroup(name)
      if (group) {
        await moveProjectToGroup(repo.id, group.id)
      }
    },
    [createProjectGroup, moveProjectToGroup, repo]
  )

  const handleMoveProjectToGroup = useCallback(
    (groupId: string) => {
      if (repo && repo.projectGroupId !== groupId) {
        void moveProjectToGroup(repo.id, groupId)
      }
    },
    [moveProjectToGroup, repo]
  )

  const handleRemoveProjectFromGroup = useCallback(() => {
    if (repo) {
      void moveProjectToGroup(repo.id, null)
    }
  }, [moveProjectToGroup, repo])

  const handleAssignWorkspaceStatus = useCallback(
    (status: string) => {
      setMenuOpenState(false)
      void Promise.all(
        activeContextWorktrees.map((item) =>
          getWorkspaceStatus(item, workspaceStatuses) === status
            ? Promise.resolve()
            : updateWorktreeMeta(item.id, { workspaceStatus: status })
        )
      )
    },
    [activeContextWorktrees, setMenuOpenState, updateWorktreeMeta, workspaceStatuses]
  )

  const handleRename = useCallback(() => {
    openModal('edit-meta', {
      worktreeId: worktree.id,
      currentDisplayName: worktree.displayName,
      currentPR: worktree.linkedPR,
      currentComment: worktree.comment,
      focus: 'displayName'
    })
  }, [openModal, worktree.comment, worktree.displayName, worktree.id, worktree.linkedPR])

  return {
    coworkingPublicationDialogOpen,
    coworkingVisibilityPending,
    createGroupDialogOpen,
    handleAssignWorkspaceStatus,
    handleCopyPath,
    handleCoworkingVisibility,
    handleCreateGroupFromRepo,
    handleMoveProjectToGroup,
    handleRemoveProjectFromGroup,
    handleRename,
    handleSubmitNewProjectGroup,
    handleTogglePin,
    handleToggleRead,
    setCoworkingPublicationDialogOpen,
    setCreateGroupDialogOpen
  }
}

export type WorkspaceMenuActions = ReturnType<typeof useWorkspaceMenuActions>
