import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, WarningCircle as CircleAlert } from '@phosphor-icons/react'
import { LoadingIndicator } from '@/components/loading-indicator'
import { toast } from 'sonner'
import type { SpoolWindowsFirewallStatus } from '../../../../shared/spool/spool-windows-firewall-contract'
import { SPOOL_INGRESS_PORT } from '../../../../shared/spool/spool-wire-contract'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'

export function SpoolWindowsFirewallNotice(): React.JSX.Element {
  const [status, setStatus] = useState<SpoolWindowsFirewallStatus | null>(null)
  const [repairing, setRepairing] = useState(false)
  const mountedRef = useMountedRef()

  const inspect = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.spoolSharing.getWindowsFirewallStatus()
      if (mountedRef.current) {
        setStatus(next)
      }
    } catch {
      if (mountedRef.current) {
        setStatus(null)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void inspect()
    window.addEventListener('focus', inspect)
    return () => window.removeEventListener('focus', inspect)
  }, [inspect])

  async function repair(): Promise<void> {
    setRepairing(true)
    try {
      const result = await window.api.spoolSharing.repairWindowsFirewall()
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        toast.success(
          translate(
            'auto.components.spool.SpoolWindowsFirewallNotice.repairSuccess',
            'Windows Firewall rule repaired.'
          )
        )
        await inspect()
      } else if (result.reason !== 'cancelled') {
        showRepairFailure()
      }
    } catch {
      if (mountedRef.current) {
        showRepairFailure()
      }
    } finally {
      if (mountedRef.current) {
        setRepairing(false)
      }
    }
  }

  const port = status?.supported ? status.port : SPOOL_INGRESS_PORT
  const inspectionUnavailable = status?.supported && !status.inspectionAvailable
  const ruleAvailable = status?.supported && status.ruleAllowed
  return (
    <div className="px-1 pb-2">
      <div className="rounded-lg border border-border bg-muted/40 p-2.5">
        <div className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">
              {ruleAvailable
                ? translate(
                    'auto.components.spool.SpoolWindowsFirewallNotice.readyTitle',
                    'Restart Spool sharing'
                  )
                : translate(
                    'auto.components.spool.SpoolWindowsFirewallNotice.title',
                    'Spool is blocked by Windows Firewall'
                  )}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {ruleAvailable
                ? translate(
                    'auto.components.spool.SpoolWindowsFirewallNotice.readyDescription',
                    'The required rule is available now. Reapply it to restart Spool in this app session.'
                  )
                : inspectionUnavailable
                  ? translate(
                      'auto.components.spool.SpoolWindowsFirewallNotice.inspectUnavailable',
                      'The firewall rule could not be inspected. Recreate it with administrator approval.'
                    )
                  : translate(
                      'auto.components.spool.SpoolWindowsFirewallNotice.ruleMissing',
                      'The packaged Yiru app does not have the required Private-network rule.'
                    )}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {translate(
                'auto.components.spool.SpoolWindowsFirewallNotice.ruleDetails',
                'Yiru.Spool · TCP {{port}} · Private',
                { port }
              )}
            </p>
            <Button
              type="button"
              size="xs"
              className="mt-2 w-full"
              disabled={repairing}
              onClick={() => void repair()}
            >
              {repairing ? <LoadingIndicator /> : <ShieldCheck />}
              {repairing
                ? translate(
                    'auto.components.spool.SpoolWindowsFirewallNotice.waiting',
                    'Waiting for Windows…'
                  )
                : ruleAvailable
                  ? translate(
                      'auto.components.spool.SpoolWindowsFirewallNotice.reapply',
                      'Reapply and restart'
                    )
                  : translate(
                      'auto.components.spool.SpoolWindowsFirewallNotice.repair',
                      'Repair firewall rule'
                    )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function showRepairFailure(): void {
  toast.error(
    translate(
      'auto.components.spool.SpoolWindowsFirewallNotice.repairFailed',
      'Could not repair the Windows Firewall rule.'
    )
  )
}
