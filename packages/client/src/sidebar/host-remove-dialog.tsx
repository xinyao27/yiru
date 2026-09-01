import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import type { HostRemovalTarget } from './host-rename-remove'

type HostRemoveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  target: NonNullable<HostRemovalTarget>
}

export function HostRemoveDialog({
  open,
  onOpenChange,
  label,
  target
}: HostRemoveDialogProps): React.JSX.Element {
  const handleOpenRuntimeSettings = (): void => {
    const state = useAppStore.getState()
    state.openSettingsTarget({
      pane: 'runtime-environments',
      repoId: null,
      sectionId: target.environmentId
    })
    state.openSettingsPage()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.HostRemoveDialog.3c4d5e6f7a',
              'Remove {{value0}}?',
              {
                value0: label
              }
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.HostRemoveDialog.4d5e6f7a8b',
              'This opens Runtime Hosts settings where you can remove this host.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {translate('auto.components.sidebar.HostRemoveDialog.6f7a8b9c0d', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleOpenRuntimeSettings}>
            {translate('auto.components.sidebar.HostRemoveDialog.7a8b9c0d1e', 'Open settings')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
