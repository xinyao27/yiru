import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { SpoolOwnerControlGrantView } from '../../../../shared/spool/spool-ipc-contract'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'

type WorktreeCardControlGrantsProps = {
  grants: readonly SpoolOwnerControlGrantView[]
  revokingGrantIds: ReadonlySet<string>
  onRevoke: (grantId: string) => void
}

export function WorktreeCardControlGrants({
  grants,
  revokingGrantIds,
  onRevoke
}: WorktreeCardControlGrantsProps): React.JSX.Element {
  return (
    <div
      className="space-y-0.5"
      aria-label={translate(
        'auto.components.spool.SpoolOwnerControlGrants.heading',
        'Remote control'
      )}
    >
      {grants.map((grant) => {
        const requesterLabel = `${grant.requester.userDisplayName} · ${grant.requester.nodeDisplayName}`
        return (
          <div key={grant.grantId} className="flex min-w-0 items-center gap-2 text-[11px]">
            <TruncatedSidebarLabel
              text={translate(
                'auto.components.spool.SpoolOwnerControlGrants.hasAccess',
                '{{value0}} has access',
                { value0: requesterLabel }
              )}
              className="min-w-0 flex-1 text-muted-foreground"
            />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={revokingGrantIds.has(grant.grantId)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRevoke(grant.grantId)
              }}
            >
              {translate('auto.components.spool.SpoolOwnerControlGrants.revoke', 'Revoke')}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
