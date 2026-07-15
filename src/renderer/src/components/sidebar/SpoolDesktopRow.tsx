import type React from 'react'
import { ChevronDown, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolDesktopSidebarRow } from './spool-sidebar-rows'
import { SpoolDesktopUsageHoverCard } from './SpoolDesktopUsageHoverCard'
import { getProjectGroupHeaderPaddingLeft } from './worktree-list-indentation'

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
  const content = (
    <>
      <Monitor aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <TruncatedSidebarLabel
          text={row.userDisplayName}
          className="min-w-0 text-[12px] font-semibold leading-none text-foreground"
        />
        <span className="flex min-w-0 items-center gap-1 text-[10px] leading-none text-muted-foreground/70">
          <TruncatedSidebarLabel text={row.nodeDisplayName} className="min-w-0 flex-1" />
          {connectionLabel ? <span className="shrink-0">· {connectionLabel}</span> : null}
        </span>
      </span>
      {hasProjects ? (
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/60">
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3.5 transition-transform motion-reduce:transition-none',
              !row.expanded && '-rotate-90'
            )}
          />
        </span>
      ) : null}
    </>
  )
  const className = cn(
    'flex h-8 w-full min-w-0 items-center gap-2 rounded-md pr-2 text-left transition-colors',
    'hover:bg-worktree-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
    row.connectionStatus === 'disconnected'
      ? 'text-muted-foreground'
      : 'text-worktree-sidebar-foreground'
  )
  // Why: Desktop and Project rows share one top-level sidebar alignment.
  const trigger = (
    <button
      type="button"
      aria-expanded={hasProjects ? row.expanded : undefined}
      onClick={hasProjects ? onToggle : undefined}
      className={className}
      style={{ paddingLeft: getProjectGroupHeaderPaddingLeft(0) }}
    >
      {content}
    </button>
  )
  return (
    <div className="pt-1">
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <SpoolDesktopUsageHoverCard row={row} />
      </HoverCard>
    </div>
  )
}
