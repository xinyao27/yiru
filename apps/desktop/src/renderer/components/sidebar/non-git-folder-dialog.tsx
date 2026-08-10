import React, { useCallback } from 'react'
import { addNonGitFolderAndActivate } from '~renderer/components/sidebar/add-non-git-folder-command'
import { Button } from '~renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/components/ui/dialog'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

const NonGitFolderDialog = React.memo(function NonGitFolderDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)

  const isOpen = activeModal === 'confirm-non-git-folder'
  const folderPath = typeof modalData.folderPath === 'string' ? modalData.folderPath : ''
  const runtimeEnvironmentId =
    typeof modalData.runtimeEnvironmentId === 'string' ? modalData.runtimeEnvironmentId : ''
  const runtimeEnvironmentName =
    runtimeEnvironmentId &&
    (runtimeEnvironments.find((environment) => environment.id === runtimeEnvironmentId)?.name ||
      runtimeEnvironmentId)
  const checkedHostDescription = runtimeEnvironmentName
    ? translate(
        'auto.components.sidebar.NonGitFolderDialog.79fd02cf5f',
        'This path was checked on {{hostName}}.',
        { hostName: runtimeEnvironmentName }
      )
    : translate(
        'auto.components.sidebar.NonGitFolderDialog.8851b77327',
        'This path was checked locally.'
      )

  const handleConfirm = useCallback(() => {
    if (folderPath) {
      void addNonGitFolderAndActivate(useAppStore.getState, folderPath, {
        runtimeEnvironmentId: runtimeEnvironmentId || null
      })
    }
    closeModal()
  }, [closeModal, folderPath, runtimeEnvironmentId])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.NonGitFolderDialog.e52454b7f6', 'Open as Folder')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.NonGitFolderDialog.8fba4b8cbb',
              "This folder isn't a Git repository. You'll have the editor, terminal, and search, but Git-based features won't be available."
            )}
            <span className="mt-2 block">{checkedHostDescription}</span>
          </DialogDescription>
        </DialogHeader>

        {folderPath && (
          <div className="border-border/70 bg-muted/35 border px-3 py-2 text-xs">
            <div className="text-muted-foreground break-all">{folderPath}</div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {translate('auto.components.sidebar.NonGitFolderDialog.05b33a17a9', 'Cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            {translate('auto.components.sidebar.NonGitFolderDialog.e52454b7f6', 'Open as Folder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default NonGitFolderDialog
