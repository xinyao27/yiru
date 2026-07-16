import type React from 'react'
import { Monitor } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card'
import { ProjectHeaderActions } from './ProjectHeaderActions'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolDesktopSidebarRow } from './spool-sidebar-rows'
import { SpoolDesktopUsageHoverCard } from './SpoolDesktopUsageHoverCard'
import { getProjectGroupHeaderPaddingLeft } from './worktree-list-indentation'
import { SidebarDisclosure } from './SidebarDisclosure'
import { SidebarProjectHeader } from './SidebarProjectHeader'

type SpoolDesktopRowProps = {
  row: SpoolDesktopSidebarRow
  onToggle: () => void
}

function getConnectionLabel(status: SpoolDesktopSidebarRow['connectionStatus']): string | null {
  switch (status) {
    case 'connected':
      return null
    case 'connecting':
      return translate('auto.components.sidebar.SpoolDesktopRow.connecting', 'Connecting…')
    case 'disconnected':
      return translate('auto.components.sidebar.SpoolDesktopRow.disconnected', 'Disconnected')
  }
}

export function SpoolDesktopRow({ row, onToggle }: SpoolDesktopRowProps): React.JSX.Element {
  const hasProjects = row.projectCount > 0
  const connectionLabel = getConnectionLabel(row.connectionStatus)
  // Why: Desktop is the extra outer tree level, but its chrome remains the
  // native Project header so Spool cannot drift to a parallel hover treatment.
  const trigger = (
    <SidebarProjectHeader
      role="button"
      tabIndex={hasProjects ? 0 : -1}
      aria-expanded={hasProjects ? row.expanded : undefined}
      aria-disabled={!hasProjects}
      onClick={hasProjects ? onToggle : undefined}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          !hasProjects ||
          (event.key !== 'Enter' && event.key !== ' ')
        ) {
          return
        }
        event.preventDefault()
        onToggle()
      }}
      className={hasProjects ? 'cursor-pointer' : 'cursor-default'}
      paddingLeft={getProjectGroupHeaderPaddingLeft(0)}
      icon={<Monitor aria-hidden="true" className="size-3" />}
      iconClassName="text-muted-foreground"
      label={row.userDisplayName}
      labelAfter={
        <span className="flex min-w-0 items-center gap-1 text-[10px] font-normal leading-none text-muted-foreground/70">
          <TruncatedSidebarLabel text={row.nodeDisplayName} className="min-w-0 flex-1" />
          {connectionLabel ? <span className="shrink-0">· {connectionLabel}</span> : null}
        </span>
      }
    >
      {hasProjects ? (
        <ProjectHeaderActions>
          <SidebarDisclosure
            expanded={row.expanded}
            itemLabel={row.userDisplayName}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggle()
            }}
          />
        </ProjectHeaderActions>
      ) : null}
    </SidebarProjectHeader>
  )
  return (
    <div className="pt-1">
      <HoverCard>
        <HoverCardTrigger delay={200} closeDelay={100} render={trigger} />
        <SpoolDesktopUsageHoverCard row={row} />
      </HoverCard>
    </div>
  )
}
