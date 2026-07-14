import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function SpoolControlRequestDialog(): React.JSX.Element | null {
  const request = useAppStore((state) => state.spoolControlRequestQueue[0] ?? null)
  const requestCount = useAppStore((state) => state.spoolControlRequestQueue.length)
  const removeRequest = useAppStore((state) => state.removeSpoolControlRequest)
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
        await window.api.spoolSharing.decideControl({ requestId: request.requestId, decision })
        removeRequest(request.requestId)
      } catch {
        toast.error(
          translate(
            'auto.components.spool.SpoolControlRequestDialog.decisionFailed',
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
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          // Why: approval exposes a real remote shell; Enter must never accept
          // merely because the dialog appeared while the user was typing.
          denyButtonRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.spool.SpoolControlRequestDialog.title',
              'Allow {{value0}} to control this worktree?',
              { value0: requesterLabel }
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.spool.SpoolControlRequestDialog.worktree',
              'Worktree: {{value0}}',
              { value0: request.worktreeDisplayName }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="space-y-2 leading-5">
            <p>
              {translate(
                'auto.components.spool.SpoolControlRequestDialog.capabilities',
                'They will be able to send terminal input, modify files, run commands, and use your Claude/Codex accounts.'
              )}
            </p>
            <p className="font-medium">
              {translate(
                'auto.components.spool.SpoolControlRequestDialog.shellWarning',
                'Terminal commands are not confined to this worktree.'
              )}
            </p>
          </div>
        </div>

        {requestCount > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            {translate(
              'auto.components.spool.SpoolControlRequestDialog.queued',
              '{{value0}} more control request(s) are queued.',
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
            {translate('auto.components.spool.SpoolControlRequestDialog.deny', 'Deny')}
          </Button>
          <Button type="button" disabled={isDeciding} onClick={() => void decide('allow')}>
            {translate(
              'auto.components.spool.SpoolControlRequestDialog.allow',
              'Allow this connection'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
