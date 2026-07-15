import type React from 'react'
import { cn } from '@/lib/utils'
import { AgentIcon } from '@/lib/agent-catalog'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolSessionSidebarRow } from './spool-sidebar-rows'
import { getProjectGroupHeaderPaddingLeft, SIDEBAR_TREE_INDENT } from './worktree-list-indentation'

type SpoolSessionRowProps = {
  row: SpoolSessionSidebarRow
  onSelect: () => void
}

export function SpoolSessionRow({ row, onSelect }: SpoolSessionRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      data-current={row.active ? 'true' : undefined}
      aria-current={row.active ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
        row.active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground hover:bg-worktree-sidebar-accent'
      )}
      style={{ paddingLeft: getProjectGroupHeaderPaddingLeft(1) + SIDEBAR_TREE_INDENT }}
    >
      <span aria-hidden="true" className="flex size-3.5 shrink-0 items-center justify-center">
        <AgentIcon agent={row.provider === 'other' ? null : row.provider} size={13} />
      </span>
      <TruncatedSidebarLabel text={row.title} className="min-w-0 flex-1 text-[11px] leading-none" />
    </button>
  )
}
