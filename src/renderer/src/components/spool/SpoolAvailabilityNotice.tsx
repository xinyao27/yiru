import { useRef, useState } from 'react'
import { CircleAlert, Loader2, RefreshCw } from 'lucide-react'
import { SPOOL_INGRESS_PORT } from '../../../../shared/spool/spool-wire-contract'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { SpoolAvailabilityDiagnostic } from './spool-availability-diagnostic'

export function SpoolAvailabilityNotice({
  diagnostic
}: {
  diagnostic: SpoolAvailabilityDiagnostic
}): React.JSX.Element {
  const [retrying, setRetrying] = useState(false)
  const retryInFlightRef = useRef(false)
  const mountedRef = useMountedRef()

  async function retryAvailability(): Promise<void> {
    if (retryInFlightRef.current) {
      return
    }
    retryInFlightRef.current = true
    setRetrying(true)
    try {
      await window.api.spoolSharing.retryAvailability()
    } catch {
      // Why: the sanitized availability notice remains the recovery feedback;
      // Electron transport errors may contain host details that must not surface.
    } finally {
      retryInFlightRef.current = false
      if (mountedRef.current) {
        setRetrying(false)
      }
    }
  }

  return (
    <div className="px-1 pb-2">
      <div role="status" className="rounded-lg border border-border bg-muted/40 p-2.5">
        <div className="flex items-start gap-2">
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.spool.SpoolAvailabilityNotice.title',
                'Spool is unavailable'
              )}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {getAvailabilityDescription(diagnostic)}
            </p>
            <Button
              type="button"
              size="xs"
              className="mt-2 w-full"
              disabled={retrying}
              onClick={() => void retryAvailability()}
            >
              {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {retrying
                ? translate('auto.components.spool.SpoolAvailabilityNotice.checking', 'Checking…')
                : translate(
                    'auto.components.spool.SpoolAvailabilityNotice.checkAgain',
                    'Check again'
                  )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getAvailabilityDescription(diagnostic: SpoolAvailabilityDiagnostic): string {
  switch (diagnostic) {
    case 'tailscale_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.tailscaleUnavailable',
        'Tailscale could not be found on this desktop.'
      )
    case 'tailscale_not-running':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.tailscaleNotRunning',
        'Tailscale is installed, but its service is not running.'
      )
    case 'tailscale_permission-denied':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.tailscalePermissionDenied',
        'Orca does not have permission to read Tailscale status.'
      )
    case 'tailscale_timed-out':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.tailscaleTimedOut',
        'Tailscale did not respond in time. Spool will keep checking.'
      )
    case 'tailscale_unsupported-output':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.tailscaleUnsupportedOutput',
        'Tailscale returned status data that this Orca version cannot read.'
      )
    case 'spool_port_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.portUnavailable',
        'TCP port {{port}} is already in use. Close the conflicting process; Spool will keep checking.',
        { port: SPOOL_INGRESS_PORT }
      )
    case 'spool_permission_denied':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.permissionDenied',
        'System permissions prevented Orca from opening the Spool Tailnet listener.'
      )
    case 'persistence_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.persistenceUnavailable',
        'Spool could not safely load sharing settings, so sharing remains off.'
      )
    case 'spool_unavailable':
      return translate(
        'auto.components.spool.SpoolAvailabilityNotice.unavailable',
        'Spool could not start on this desktop.'
      )
  }
}
