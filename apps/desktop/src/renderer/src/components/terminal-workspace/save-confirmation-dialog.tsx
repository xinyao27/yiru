import type React from 'react'
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
import { basename } from '~renderer/lib/path'

import type { OpenFile } from '../editor/state'

type SaveConfirmationDialogProps = {
  file: OpenFile | null
  open: boolean
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export function SaveConfirmationDialog({
  file,
  open,
  onCancel,
  onDiscard,
  onSave
}: SaveConfirmationDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.Terminal.21295c6b8c', 'Unsaved Changes')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {file
              ? translate(
                  'auto.components.Terminal.61ed600d29',
                  '"{{value0}}" has unsaved changes. Do you want to save before closing?',
                  { value0: basename(file.relativePath) }
                )
              : translate('auto.components.Terminal.46e08bc5c8', 'This file has unsaved changes.')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {translate('auto.components.Terminal.f82e9f02df', 'Cancel')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDiscard}>
            {translate('auto.components.Terminal.0037b21794', "Don't Save")}
          </Button>
          <Button type="button" size="sm" onClick={onSave}>
            {translate('auto.components.Terminal.cd51e28d8b', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
