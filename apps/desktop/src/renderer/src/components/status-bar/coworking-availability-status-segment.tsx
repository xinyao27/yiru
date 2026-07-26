import { WarningCircle, ArrowClockwise as RefreshCw } from '@phosphor-icons/react'
import { useRef, useState } from 'react'

import {
  projectCoworkingAvailabilityDiagnostic,
  type CoworkingAvailabilityDiagnostic
} from '@/components/coworking/availability-diagnostic'
import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import { COWORKING_INGRESS_PORT } from '../../../../shared/coworking/wire-contract'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './context-menu-policy'

export function CoworkingAvailabilityStatusSegment(): React.JSX.Element | null {
  const status = useAppStore((state) => state.coworkingSharingStatus)
  const rawDiagnostic = useAppStore((state) => state.coworkingSharingDiagnostic)
  const diagnostic = projectCoworkingAvailabilityDiagnostic(status, rawDiagnostic)

  // Why: unmounting the disclosure when availability recovers ensures a later
  // failure starts collapsed and only reveals details after a fresh click.
  return diagnostic ? (
    <CoworkingAvailabilityStatusSegmentContent key={diagnostic} diagnostic={diagnostic} />
  ) : null
}

function CoworkingAvailabilityStatusSegmentContent({
  diagnostic
}: {
  diagnostic: CoworkingAvailabilityDiagnostic
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const retryInFlightRef = useRef(false)
  const mountedRef = useMountedRef()

  const title = translate(
    'auto.components.coworking.CoworkingAvailabilityStatusSegment.title',
    'Coworking is unavailable'
  )

  async function retryAvailability(): Promise<void> {
    if (retryInFlightRef.current) {
      return
    }
    retryInFlightRef.current = true
    setRetrying(true)
    try {
      await window.api.coworkingSharing.retryAvailability()
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
            variant="status-bar-quiet"
            size="status-bar"
            {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
            className="text-[11px] font-medium"
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
              {retrying ? <LoadingIndicator /> : <RefreshCw weight="regular" />}
              {retrying
                ? translate(
                    'auto.components.coworking.CoworkingAvailabilityStatusSegment.checking',
                    'Checking…'
                  )
                : translate(
                    'auto.components.coworking.CoworkingAvailabilityStatusSegment.checkAgain',
                    'Check again'
                  )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getAvailabilityDescription(diagnostic: CoworkingAvailabilityDiagnostic): string {
  switch (diagnostic) {
    case 'tailscale_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleUnavailable',
        'Tailscale could not be found on this desktop.'
      )
    case 'tailscale_not-running':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleNotRunning',
        'Tailscale is installed, but its service is not running.'
      )
    case 'tailscale_permission-denied':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscalePermissionDenied',
        'Yiru does not have permission to read Tailscale status.'
      )
    case 'tailscale_timed-out':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleTimedOut',
        'Tailscale did not respond in time. Coworking will keep checking.'
      )
    case 'tailscale_unsupported-output':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleUnsupportedOutput',
        'Tailscale returned status data that this Yiru version cannot read.'
      )
    case 'coworking_port_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.portUnavailable',
        'TCP port {{port}} is already in use. Close the conflicting process; Coworking will keep checking.',
        { port: COWORKING_INGRESS_PORT }
      )
    case 'coworking_permission_denied':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.permissionDenied',
        'System permissions prevented Yiru from opening the Coworking Tailnet listener.'
      )
    case 'persistence_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.persistenceUnavailable',
        'Coworking could not safely load sharing settings, so sharing remains off.'
      )
    case 'coworking_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.unavailable',
        'Coworking could not start on this desktop.'
      )
  }
}
