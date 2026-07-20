import { WarningCircle } from '@phosphor-icons/react'
import { useRef, useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { ArrowClockwise as RefreshCw } from '@/components/regular-icons'
import {
  projectSpoolAvailabilityDiagnostic,
  type SpoolAvailabilityDiagnostic
} from '@/components/spool/spool-availability-diagnostic'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import { SPOOL_INGRESS_PORT } from '../../../../shared/spool/spool-wire-contract'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'

export function SpoolAvailabilityStatusSegment(): React.JSX.Element | null {
  const status = useAppStore((state) => state.spoolSharingStatus)
  const rawDiagnostic = useAppStore((state) => state.spoolSharingDiagnostic)
  const diagnostic = projectSpoolAvailabilityDiagnostic(status, rawDiagnostic)

  // Why: unmounting the disclosure when availability recovers ensures a later
  // failure starts collapsed and only reveals details after a fresh click.
  return diagnostic ? (
    <SpoolAvailabilityStatusSegmentContent key={diagnostic} diagnostic={diagnostic} />
  ) : null
}

function SpoolAvailabilityStatusSegmentContent({
  diagnostic
}: {
  diagnostic: SpoolAvailabilityDiagnostic
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const retryInFlightRef = useRef(false)
  const mountedRef = useMountedRef()

  const title = translate(
    'auto.components.spool.SpoolAvailabilityStatusSegment.title',
    'Spool is unavailable'
  )

  async function retryAvailability(): Promise<void> {
    if (retryInFlightRef.current) {
      return
    }
    retryInFlightRef.current = true
    setRetrying(true)
    try {
      await window.api.spoolSharing.retryAvailability()
    } catch {
      // Why: keep host-sensitive Electron errors out of the UI; the sanitized
      // diagnostic remains visible as the recovery feedback.
    } finally {
      retryInFlightRef.current = false
      if (mountedRef.current) {
        setRetrying(false)
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
            className="text-muted-foreground hover:text-foreground h-auto gap-1.5 px-1 py-0.5 text-[11px] font-medium"
            aria-label={title}
            aria-expanded={open}
          >
            <WarningCircle className="size-3 text-amber-500" />
            <span>{title}</span>
          </Button>
        }
      />

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="border-border flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium">
          <WarningCircle className="size-3.5 shrink-0 text-amber-500" />
          <span>{title}</span>
        </div>
        <div className="px-3 py-3">
          <p className="text-muted-foreground text-xs leading-5">
            {getAvailabilityDescription(diagnostic)}
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="xs"
              disabled={retrying}
              onClick={() => void retryAvailability()}
            >
              {retrying ? <LoadingIndicator /> : <RefreshCw />}
              {retrying
                ? translate(
                    'auto.components.spool.SpoolAvailabilityStatusSegment.checking',
                    'Checking…'
                  )
                : translate(
                    'auto.components.spool.SpoolAvailabilityStatusSegment.checkAgain',
                    'Check again'
                  )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getAvailabilityDescription(diagnostic: SpoolAvailabilityDiagnostic): string {
  switch (diagnostic) {
    case 'tailscale_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.tailscaleUnavailable',
        'Tailscale could not be found on this desktop.'
      )
    case 'tailscale_not-running':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.tailscaleNotRunning',
        'Tailscale is installed, but its service is not running.'
      )
    case 'tailscale_permission-denied':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.tailscalePermissionDenied',
        'Yiru does not have permission to read Tailscale status.'
      )
    case 'tailscale_timed-out':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.tailscaleTimedOut',
        'Tailscale did not respond in time. Spool will keep checking.'
      )
    case 'tailscale_unsupported-output':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.tailscaleUnsupportedOutput',
        'Tailscale returned status data that this Yiru version cannot read.'
      )
    case 'spool_port_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.portUnavailable',
        'TCP port {{port}} is already in use. Close the conflicting process; Spool will keep checking.',
        { port: SPOOL_INGRESS_PORT }
      )
    case 'spool_permission_denied':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.permissionDenied',
        'System permissions prevented Yiru from opening the Spool Tailnet listener.'
      )
    case 'persistence_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.persistenceUnavailable',
        'Spool could not safely load sharing settings, so sharing remains off.'
      )
    case 'spool_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityStatusSegment.unavailable',
        'Spool could not start on this desktop.'
      )
  }
}
