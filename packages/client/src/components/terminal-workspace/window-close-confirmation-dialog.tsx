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

type WindowCloseConfirmationDialogProps = {
  open: boolean
  onCancel: () => void
  onConfirmClose: () => void
}

// Window close confirmation dialog — shown for local terminals with running
// child processes. SSH terminals detach/persist through the relay lifecycle.
export function WindowCloseConfirmationDialog({
  open,
  onCancel,
  onConfirmClose
}: WindowCloseConfirmationDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.Terminal.2fa9c69ff3', 'Close Window?')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.Terminal.7958465754',
              'There are local terminals with running processes. Close the window anyway?'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {translate('auto.components.Terminal.f82e9f02df', 'Cancel')}
          </Button>
          <Button type="button" variant="destructive" size="sm" autoFocus onClick={onConfirmClose}>
            {translate('auto.components.Terminal.73768427cf', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
