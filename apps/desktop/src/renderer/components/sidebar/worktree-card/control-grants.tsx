import type React from 'react'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import type { CoworkingOwnerControlGrantView } from '~shared/coworking/ipc-contract'

import { TruncatedSidebarLabel } from '../truncated-sidebar-label'

type WorktreeCardControlGrantsProps = {
  grants: readonly CoworkingOwnerControlGrantView[]
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
        'auto.components.coworking.CoworkingOwnerControlGrants.heading',
        'Remote control'
      )}
    >
      {grants.map((grant) => {
        const requesterLabel = `${grant.requester.userDisplayName} · ${grant.requester.nodeDisplayName}`
        return (
          <div key={grant.grantId} className="flex min-w-0 items-center gap-2 text-[11px]">
            <TruncatedSidebarLabel
              text={translate(
                'auto.components.coworking.CoworkingOwnerControlGrants.hasAccess',
                '{{value0}} has access',
                { value0: requesterLabel }
              )}
              className="text-muted-foreground min-w-0 flex-1"
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
              {translate('auto.components.coworking.CoworkingOwnerControlGrants.revoke', 'Revoke')}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
