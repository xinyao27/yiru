import type React from 'react'
import { ChevronRight, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolDesktopSidebarRow } from './spool-sidebar-rows'

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
      <span className="flex size-3 shrink-0 items-center justify-center">
        {hasProjects ? (
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'size-3 text-muted-foreground transition-transform motion-reduce:transition-none',
              row.expanded && 'rotate-90'
            )}
          />
        ) : (
          <span className="size-3" />
        )}
      </span>
      <Monitor aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <TruncatedSidebarLabel
          text={row.userDisplayName}
          className="text-[13px] font-medium leading-4"
        />
        <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
          <TruncatedSidebarLabel text={row.nodeDisplayName} className="min-w-0 flex-1" />
          {connectionLabel ? <span className="shrink-0">· {connectionLabel}</span> : null}
        </span>
      </span>
    </>
  )
  const className = cn(
    'flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left',
    'text-worktree-sidebar-foreground transition-colors',
    hasProjects &&
      'hover:bg-worktree-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring'
  )
  return hasProjects ? (
    <button type="button" aria-expanded={row.expanded} onClick={onToggle} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  )
}
