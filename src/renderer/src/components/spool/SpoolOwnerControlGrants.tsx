import type React from 'react'
import { useCallback, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { TruncatedSidebarLabel } from '@/components/sidebar/truncated-sidebar-label'

export function SpoolOwnerControlGrants(): React.JSX.Element | null {
  const grants = useAppStore((state) => state.spoolOwnerControlGrants)
  const [revokingGrantIds, setRevokingGrantIds] = useState<ReadonlySet<string>>(new Set())

  const revoke = useCallback(async (grantId: string): Promise<void> => {
    setRevokingGrantIds((current) => new Set(current).add(grantId))
    try {
      await window.api.spoolSharing.revokeControl({ grantId })
    } catch {
      setRevokingGrantIds((current) => {
        const next = new Set(current)
        next.delete(grantId)
        return next
      })
      toast.error(
        translate(
          'auto.components.spool.SpoolOwnerControlGrants.revokeFailed',
          'Could not revoke remote control.'
        )
      )
    }
  }, [])

  if (grants.length === 0) {
    return null
  }

  return (
    <section className="mx-2 mb-1 rounded-lg border border-worktree-sidebar-border bg-worktree-sidebar-accent/50 p-2">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-3" />
        {translate('auto.components.spool.SpoolOwnerControlGrants.heading', 'Remote control')}
      </div>
      <div className="scrollbar-sleek max-h-28 space-y-1 overflow-y-auto">
        {grants.map((grant) => {
          const requesterLabel = `${grant.requester.userDisplayName} · ${grant.requester.nodeDisplayName}`
          const revoking = revokingGrantIds.has(grant.grantId)
          return (
            <div
              key={grant.grantId}
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-[11px]"
            >
              <span className="min-w-0 flex-1">
                <TruncatedSidebarLabel
                  text={grant.worktreeDisplayName}
                  className="font-medium text-worktree-sidebar-foreground"
                />
                <TruncatedSidebarLabel
                  text={translate(
                    'auto.components.spool.SpoolOwnerControlGrants.hasAccess',
                    '{{value0}} has access',
                    { value0: requesterLabel }
                  )}
                  className="text-muted-foreground"
                />
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={revoking}
                onClick={() => void revoke(grant.grantId)}
              >
                {translate('auto.components.spool.SpoolOwnerControlGrants.revoke', 'Revoke')}
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
