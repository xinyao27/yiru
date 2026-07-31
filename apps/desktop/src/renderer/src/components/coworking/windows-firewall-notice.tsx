import { ShieldCheck, WarningCircle as CircleAlert } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { translate } from '~renderer/i18n/i18n'
import type { CoworkingWindowsFirewallStatus } from '~shared/coworking/windows-firewall-contract'
import { COWORKING_INGRESS_PORT } from '~shared/coworking/wire-contract'

export function CoworkingWindowsFirewallNotice(): React.JSX.Element {
  const [status, setStatus] = useState<CoworkingWindowsFirewallStatus | null>(null)
  const [repairing, setRepairing] = useState(false)
  const mountedRef = useMountedRef()

  const inspect = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.coworkingSharing.getWindowsFirewallStatus()
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
      const result = await window.api.coworkingSharing.repairWindowsFirewall()
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        toast.success(
          translate(
            'auto.components.coworking.CoworkingWindowsFirewallNotice.repairSuccess',
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

  const port = status?.supported ? status.port : COWORKING_INGRESS_PORT
  const inspectionUnavailable = status?.supported && !status.inspectionAvailable
  const ruleAvailable = status?.supported && status.ruleAllowed
  return (
    <div className="px-1 pb-2">
      <div className="border-border bg-muted/40 border p-2.5">
        <div className="flex items-start gap-2">
          <CircleAlert className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-xs font-medium">
              {ruleAvailable
                ? translate(
                    'auto.components.coworking.CoworkingWindowsFirewallNotice.readyTitle',
                    'Restart Coworking sharing'
                  )
                : translate(
                    'auto.components.coworking.CoworkingWindowsFirewallNotice.title',
                    'Coworking is blocked by Windows Firewall'
                  )}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px] leading-4">
              {ruleAvailable
                ? translate(
                    'auto.components.coworking.CoworkingWindowsFirewallNotice.readyDescription',
                    'The required rule is available now. Reapply it to restart Coworking in this app session.'
                  )
                : inspectionUnavailable
                  ? translate(
                      'auto.components.coworking.CoworkingWindowsFirewallNotice.inspectUnavailable',
                      'The firewall rule could not be inspected. Recreate it with administrator approval.'
                    )
                  : translate(
                      'auto.components.coworking.CoworkingWindowsFirewallNotice.ruleMissing',
                      'The packaged Yiru app does not have the required Private-network rule.'
                    )}
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-[11px]">
              {translate(
                'auto.components.coworking.CoworkingWindowsFirewallNotice.ruleDetails',
                'Yiru.Coworking · TCP {{port}} · Private',
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
                    'auto.components.coworking.CoworkingWindowsFirewallNotice.waiting',
                    'Waiting for Windows…'
                  )
                : ruleAvailable
                  ? translate(
                      'auto.components.coworking.CoworkingWindowsFirewallNotice.reapply',
                      'Reapply and restart'
                    )
                  : translate(
                      'auto.components.coworking.CoworkingWindowsFirewallNotice.repair',
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
      'auto.components.coworking.CoworkingWindowsFirewallNotice.repairFailed',
      'Could not repair the Windows Firewall rule.'
    )
  )
}
