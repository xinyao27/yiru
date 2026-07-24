import { FolderPlus } from '@phosphor-icons/react'
import React, { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import { isGitRepoKind } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/types'
import { finishProjectAddWithDefaultCheckout } from './project-added-default-checkout'

const NON_GIT_REPO_ERROR = 'Not a valid git repository'

const AddProjectFromFolderDialog = React.memo(function AddProjectFromFolderDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const openModal = useAppStore((s) => s.openModal)
  const addRepoPath = useAppStore((s) => s.addRepoPath)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)

  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useMountedRef()
  const addGenRef = useRef(0)

  const isOpen = activeModal === 'confirm-add-project-from-folder'
  const [previousOpen, setPreviousOpen] = useState(isOpen)
  const folderPath = typeof modalData.folderPath === 'string' ? modalData.folderPath : ''
  const connectionId = typeof modalData.connectionId === 'string' ? modalData.connectionId : ''

  if (isOpen !== previousOpen) {
    setPreviousOpen(isOpen)
    if (!isOpen) {
      // Why: closed modal state is fully local; clear it before commit so the
      // next open never paints stale progress or errors.
      addGenRef.current++
      setIsAdding(false)
      setError(null)
    }
  }

  const openNonGitConfirmation = useCallback(() => {
    closeModal()
    openModal('confirm-non-git-folder', {
      folderPath,
      ...(connectionId ? { connectionId } : {})
    })
  }, [closeModal, connectionId, folderPath, openModal])

  const handleConfirm = useCallback(async () => {
    if (!folderPath || isAdding) {
      return
    }
    const gen = ++addGenRef.current
    setIsAdding(true)
    setError(null)
    try {
      let repo: Repo | null
      if (connectionId) {
        const result = await window.api.repos.addRemote({
          connectionId,
          remotePath: folderPath
        })
        if ('error' in result) {
          throw new Error(result.error)
        }
        repo = result.repo
        const state = useAppStore.getState()
        const existingIdx = state.repos.findIndex((r) => r.id === repo?.id)
        if (existingIdx !== -1) {
          state.clearYiruHookTrustForRepo(repo.id)
          const updated = [...state.repos]
          updated[existingIdx] = repo
          useAppStore.setState({ repos: updated })
        } else {
          useAppStore.setState({ repos: [...state.repos, repo] })
        }
        if (!mountedRef.current || gen !== addGenRef.current) {
          return
        }
        toast.success(
          translate(
            'auto.components.sidebar.AddProjectFromFolderDialog.e643b30398',
            'Project added on SSH host'
          ),
          { description: repo.displayName }
        )
      } else {
        repo = await addRepoPath(folderPath)
      }

      if (!mountedRef.current || gen !== addGenRef.current) {
        return
      }
      if (!repo) {
        return
      }
      if (!isGitRepoKind(repo)) {
        openNonGitConfirmation()
        return
      }
      // Why: after the repo is already added, a non-authoritative refresh
      // should still close onto the project row instead of trapping the user.
      await fetchWorktrees(repo.id, { requireAuthoritative: true })
      if (!mountedRef.current || gen !== addGenRef.current) {
        return
      }
      await finishProjectAddWithDefaultCheckout({
        repoId: repo.id,
        source: connectionId ? 'ssh_remote_path' : 'local_folder_picker',
        selectedPath: folderPath,
        closeModal,
        setHideDefaultBranchWorkspace
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes(NON_GIT_REPO_ERROR)) {
        if (mountedRef.current && gen === addGenRef.current) {
          openNonGitConfirmation()
        }
        return
      }
      if (mountedRef.current && gen === addGenRef.current) {
        setError(message)
      }
    } finally {
      if (mountedRef.current && gen === addGenRef.current) {
        setIsAdding(false)
      }
    }
  }, [
    addRepoPath,
    closeModal,
    connectionId,
    fetchWorktrees,
    folderPath,
    isAdding,
    mountedRef,
    openNonGitConfirmation,
    setHideDefaultBranchWorkspace
  ])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        addGenRef.current++
        closeModal()
      }
    },
    [closeModal]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.AddProjectFromFolderDialog.7d1f51678c',
              'Add Project'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.AddProjectFromFolderDialog.046751dbfb',
              'Add this folder as a separate Yiru project.'
            )}
          </DialogDescription>
        </DialogHeader>

        {folderPath && (
          <div className="border-border/70 bg-muted/35 border px-3 py-2 text-xs">
            <div className="text-muted-foreground font-mono break-all">{folderPath}</div>
          </div>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isAdding}>
            {translate('auto.components.sidebar.AddProjectFromFolderDialog.7726a16374', 'Cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={!folderPath || isAdding}>
            {isAdding ? <LoadingIndicator className="size-4" /> : <FolderPlus className="size-4" />}
            {translate(
              'auto.components.sidebar.AddProjectFromFolderDialog.7d1f51678c',
              'Add Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default AddProjectFromFolderDialog
