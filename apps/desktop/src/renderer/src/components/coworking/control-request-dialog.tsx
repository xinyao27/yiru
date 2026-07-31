import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Warning as AlertTriangle } from '@phosphor-icons/react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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

export function CoworkingControlRequestDialog(): React.JSX.Element | null {
  const request = useAppStore((state) => state.coworkingControlRequestQueue[0] ?? null)
  const requestCount = useAppStore((state) => state.coworkingControlRequestQueue.length)
  const removeRequest = useAppStore((state) => state.removeCoworkingControlRequest)
  const denyButtonRef = useRef<HTMLButtonElement>(null)
  const [decidingRequestId, setDecidingRequestId] = useState<string | null>(null)

  useEffect(() => {
    if (decidingRequestId && request?.requestId !== decidingRequestId) {
      setDecidingRequestId(null)
    }
  }, [decidingRequestId, request?.requestId])

  const decide = useCallback(
    async (decision: 'allow' | 'deny'): Promise<void> => {
      if (!request || decidingRequestId) {
        return
      }
      setDecidingRequestId(request.requestId)
      try {
        await window.api.coworkingSharing.decideControl({ requestId: request.requestId, decision })
        removeRequest(request.requestId)
      } catch {
        toast.error(
          translate(
            'auto.components.coworking.CoworkingControlRequestDialog.decisionFailed',
            'Could not send the control decision.'
          )
        )
        setDecidingRequestId(null)
      }
    },
    [decidingRequestId, removeRequest, request]
  )

  if (!request) {
    return null
  }

  const requesterLabel = `${request.requester.userDisplayName} · ${request.requester.nodeDisplayName}`
  const isDeciding = decidingRequestId === request.requestId

  return (
    <Dialog
      open
      onOpenChange={(_open, eventDetails: DialogPrimitive.Root.ChangeEventDetails) => {
        // Why: approval exposes a real remote shell; escape or an outside click
        // must never dismiss the prompt — the user has to explicitly decide.
        if (eventDetails.reason === 'escape-key' || eventDetails.reason === 'outside-press') {
          eventDetails.cancel()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        // Why: approval exposes a real remote shell; focus Deny so Enter never
        // accepts merely because the dialog appeared while the user was typing.
        initialFocus={denyButtonRef}
      >
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.coworking.CoworkingControlRequestDialog.title',
              'Allow {{value0}} to control this worktree?',
              { value0: requesterLabel }
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.coworking.CoworkingControlRequestDialog.worktree',
              'Worktree: {{value0}} / {{value1}}',
              {
                value0: request.projectDisplayName,
                value1: request.worktreeDisplayName
              }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border bg-muted/50 flex gap-3 border p-3 text-sm">
          <AlertTriangle
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <div className="space-y-2 leading-5">
            <p>
              {translate(
                'auto.components.coworking.CoworkingControlRequestDialog.capabilities',
                'They will be able to create terminals, start enabled agents, send terminal input, modify files, run commands, and use your active agent accounts.'
              )}
            </p>
            <p className="font-medium">
              {translate(
                'auto.components.coworking.CoworkingControlRequestDialog.shellWarning',
                'Terminal commands are not confined to this worktree.'
              )}
            </p>
          </div>
        </div>

        {requestCount > 1 ? (
          <p className="text-muted-foreground text-[11px]">
            {translate(
              'auto.components.coworking.CoworkingControlRequestDialog.queued',
              'Queued control requests: {{value0}}.',
              { value0: requestCount - 1 }
            )}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            ref={denyButtonRef}
            type="button"
            variant="outline"
            disabled={isDeciding}
            onClick={() => void decide('deny')}
          >
            {translate('auto.components.coworking.CoworkingControlRequestDialog.deny', 'Deny')}
          </Button>
          <Button type="button" disabled={isDeciding} onClick={() => void decide('allow')}>
            {translate(
              'auto.components.coworking.CoworkingControlRequestDialog.allow',
              'Allow this connection'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
