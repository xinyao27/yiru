import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Warning as AlertTriangle, Eye, TerminalWindow } from '@phosphor-icons/react'
import type React from 'react'
import { useRef, useState } from 'react'
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
import { Input } from '~renderer/components/ui/input'
import { Label } from '~renderer/components/ui/label'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import type {
  CoworkingHostAccessTier,
  CoworkingOwnerHostAccessRequestView
} from '~shared/coworking/host-access-contract'

export function CoworkingHostAccessRequestDialog(): React.JSX.Element | null {
  const request = useAppStore((state) => state.coworkingHostAccessRequestQueue[0] ?? null)
  const requestCount = useAppStore((state) => state.coworkingHostAccessRequestQueue.length)
  return request ? (
    <CoworkingHostAccessRequestPrompt
      key={request.requestId}
      request={request}
      requestCount={requestCount}
    />
  ) : null
}

function CoworkingHostAccessRequestPrompt({
  request,
  requestCount
}: {
  request: CoworkingOwnerHostAccessRequestView
  requestCount: number
}): React.JSX.Element {
  const denyButtonRef = useRef<HTMLButtonElement>(null)
  const [name, setName] = useState(request.requester.nodeDisplayName)
  const [isDeciding, setIsDeciding] = useState(false)
  const requesterLabel = `${request.requester.userDisplayName} · ${request.requester.nodeDisplayName}`

  const deny = async (): Promise<void> => {
    if (isDeciding) {
      return
    }
    setIsDeciding(true)
    try {
      await window.api.coworkingSharing.decideHostAccess({
        requestId: request.requestId,
        decision: 'deny'
      })
    } catch {
      setIsDeciding(false)
      toast.error(
        translate(
          'auto.components.coworking.CoworkingHostAccessRequestDialog.decisionFailed',
          'Could not send the host access decision.'
        )
      )
    }
  }

  const approve = async (tier: CoworkingHostAccessTier): Promise<void> => {
    const grantName = name.trim()
    if (!grantName) {
      toast.error(
        translate(
          'auto.components.coworking.CoworkingHostAccessRequestDialog.nameRequired',
          'Name this authorized device before continuing.'
        )
      )
      return
    }
    setIsDeciding(true)
    try {
      await window.api.coworkingSharing.decideHostAccess({
        requestId: request.requestId,
        decision: 'allow',
        name: grantName,
        tier
      })
    } catch {
      setIsDeciding(false)
      toast.error(
        translate(
          'auto.components.coworking.CoworkingHostAccessRequestDialog.decisionFailed',
          'Could not send the host access decision.'
        )
      )
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(_open, eventDetails: DialogPrimitive.Root.ChangeEventDetails) => {
        if (eventDetails.reason === 'escape-key' || eventDetails.reason === 'outside-press') {
          eventDetails.cancel()
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-lg" initialFocus={denyButtonRef}>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.coworking.CoworkingHostAccessRequestDialog.title',
              'Authorize {{value0}} as a remote host client?',
              { value0: requesterLabel }
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.coworking.CoworkingHostAccessRequestDialog.description',
              'This authorization lasts 90 days and is limited to this machine.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="coworking-host-access-name">
            {translate(
              'auto.components.coworking.CoworkingHostAccessRequestDialog.deviceName',
              'Authorized device name'
            )}
          </Label>
          <Input
            id="coworking-host-access-name"
            value={name}
            required
            disabled={isDeciding}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-border flex flex-col gap-3 border p-3">
            <div className="flex items-center gap-2 font-medium">
              <Eye aria-hidden="true" className="size-4" />
              {translate(
                'auto.components.coworking.CoworkingHostAccessRequestDialog.readOnly',
                'Read only'
              )}
            </div>
            <p className="text-muted-foreground flex-1 text-xs leading-5">
              {translate(
                'auto.components.coworking.CoworkingHostAccessRequestDialog.readOnlyDescription',
                'Browse code and git history on this machine.'
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={isDeciding}
              onClick={() => void approve('read')}
            >
              {translate(
                'auto.components.coworking.CoworkingHostAccessRequestDialog.grantReadOnly',
                'Grant read only'
              )}
            </Button>
          </div>

          <div className="border-destructive/50 bg-destructive/5 flex flex-col gap-3 border p-3">
            <div className="flex items-center gap-2 font-medium">
              <TerminalWindow aria-hidden="true" className="size-4" />
              {translate(
                'auto.components.coworking.CoworkingHostAccessRequestDialog.fullAccess',
                'Full access'
              )}
            </div>
            <p className="text-destructive flex-1 text-xs leading-5">
              {translate(
                'auto.components.coworking.CoworkingHostAccessRequestDialog.fullAccessDescription',
                'They will receive continuous shell access on this machine.'
              )}
            </p>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeciding}
              onClick={() => void approve('host')}
            >
              {translate(
                'auto.components.coworking.CoworkingHostAccessRequestDialog.grantFullAccess',
                'Grant full access'
              )}
            </Button>
          </div>
        </div>

        <div className="border-border bg-muted/50 flex gap-3 border p-3 text-sm">
          <AlertTriangle aria-hidden="true" className="text-muted-foreground mt-0.5 size-4" />
          <p>
            {translate(
              'auto.components.coworking.CoworkingHostAccessRequestDialog.revokeHelp',
              'You can revoke this authorization at any time in Settings → Coworking.'
            )}
          </p>
        </div>

        {requestCount > 1 ? (
          <p className="text-muted-foreground text-[11px]">
            {translate(
              'auto.components.coworking.CoworkingHostAccessRequestDialog.queued',
              'Queued host access requests: {{value0}}.',
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
            onClick={() => void deny()}
          >
            {translate('auto.components.coworking.CoworkingHostAccessRequestDialog.deny', 'Deny')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
