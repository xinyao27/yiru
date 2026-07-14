import type React from 'react'
import { ChevronRight, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolWorktreeSidebarRow } from './spool-sidebar-rows'

type SpoolWorktreeRowProps = {
  row: SpoolWorktreeSidebarRow
  onToggle: () => void
  onSelect: () => void
}

function getDisclosureLabel(row: SpoolWorktreeSidebarRow): string {
  return row.expanded
    ? translate('auto.components.sidebar.SpoolWorktreeRow.collapse', 'Collapse {{value0}}', {
        value0: row.name
      })
    : translate('auto.components.sidebar.SpoolWorktreeRow.expand', 'Expand {{value0}}', {
        value0: row.name
      })
}

export function SpoolWorktreeRow({
  row,
  onToggle,
  onSelect
}: SpoolWorktreeRowProps): React.JSX.Element {
  const hasSessions = row.sessionCount > 0
  return (
    <div
      data-current={row.active ? 'true' : undefined}
      className={cn(
        'flex min-h-8 min-w-0 items-center rounded-md pl-5 pr-1 transition-colors',
        row.active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground hover:bg-worktree-sidebar-accent'
      )}
    >
      {hasSessions ? (
        <button
          type="button"
          aria-label={getDisclosureLabel(row)}
          aria-expanded={row.expanded}
          onClick={onToggle}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'size-3 transition-transform motion-reduce:transition-none',
              row.expanded && 'rotate-90'
            )}
          />
        </button>
      ) : (
        <span className="block size-5 shrink-0" />
      )}
      <button
        type="button"
        aria-current={row.active ? 'page' : undefined}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
      >
        <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <TruncatedSidebarLabel text={row.name} className="text-[13px] font-medium leading-4" />
          {row.branch ? (
            <TruncatedSidebarLabel
              text={row.branch}
              className="text-[11px] leading-4 text-muted-foreground"
            />
          ) : null}
        </span>
      </button>
    </div>
  )
}
