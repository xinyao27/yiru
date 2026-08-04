import React from 'react'
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
    state.openSettingsTarget({ pane: 'servers', repoId: null, sectionId: target.environmentId })
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
              'This opens the Yiru servers settings where you can remove this server.'
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
