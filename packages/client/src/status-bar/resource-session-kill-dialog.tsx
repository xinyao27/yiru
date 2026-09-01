import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import type { ResourceSessionKill } from './use-resource-session-kill'

export function ResourceSessionKillDialog({
  sessionKill
}: {
  sessionKill: ResourceSessionKill
}): React.JSX.Element {
  return (
    <Dialog
      open={sessionKill.confirmation !== null}
      onOpenChange={(next, eventDetails) => {
        if (next) {
          return
        }
        if (sessionKill.isKilling) {
          eventDetails.cancel()
          return
        }
        sessionKill.setConfirmation(null)
      }}
    >
      <DialogContent className="max-w-md" showCloseButton={!sessionKill.isKilling}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.e9a5d3c2b1f0',
              'Kill {{value0}}?',
              {
                value0:
                  sessionKill.confirmation?.label ??
                  translate(
                    'auto.components.status.bar.ResourceUsageStatusSegment.138b99bd80',
                    'this session'
                  )
              }
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.67c4ecda49',
              "Force-quits this terminal. Any unsaved work in the pane is lost. This can't be undone."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => sessionKill.setConfirmation(null)}
            disabled={sessionKill.isKilling}
          >
            {translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.946d9f94d0',
              'Cancel'
            )}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void sessionKill.confirm()}
            disabled={sessionKill.isKilling}
          >
            {sessionKill.isKilling ? <LoadingIndicator className="size-4" /> : null}
            {sessionKill.isKilling
              ? translate(
                  'auto.components.status.bar.ResourceUsageStatusSegment.41ae4fa725',
                  'Killing…'
                )
              : translate(
                  'auto.components.status.bar.ResourceUsageStatusSegment.b10695d6ce',
                  'Kill session'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
