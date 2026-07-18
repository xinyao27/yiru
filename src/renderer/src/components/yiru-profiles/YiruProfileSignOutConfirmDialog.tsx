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
import { translate } from '@/i18n/i18n'

export function YiruProfileSignOutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  signingOut
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  signingOut: boolean
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.yiru.profiles.signout.confirm.title', 'Sign out of Yiru?')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.yiru.profiles.signout.confirm.description',
              "You'll be signed out of Yiru on this device. Your local projects and worktrees won't be affected."
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={signingOut}
          >
            {translate('auto.components.yiru.profiles.signout.confirm.cancel', 'Cancel')}
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={signingOut}>
            {signingOut ? <LoadingIndicator className="size-4" /> : null}
            {translate('auto.components.yiru.profiles.signout.confirm.action', 'Sign out')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
