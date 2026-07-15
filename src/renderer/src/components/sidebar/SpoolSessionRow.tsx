import type React from 'react'
import { SquareTerminal } from 'lucide-react'
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
  // Why: Sessions retain the full child step beneath the newly indented Worktree.
  return (
    <button
      type="button"
      data-current={row.active ? 'true' : undefined}
      data-focused-agent-pane={row.active ? 'true' : undefined}
      aria-current={row.active ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'worktree-agent-row-hover flex h-6 w-full min-w-0 items-center gap-1 rounded-sm pr-1 text-left text-[11px] leading-none text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
        row.active && 'text-foreground'
      )}
      style={{ paddingLeft: getProjectGroupHeaderPaddingLeft(2) + SIDEBAR_TREE_INDENT }}
    >
      <span aria-hidden="true" className="flex size-3.5 shrink-0 items-center justify-center">
        {row.provider === 'other' ? (
          <SquareTerminal className="size-3.5" />
        ) : (
          <AgentIcon agent={row.provider} size={13} />
        )}
      </span>
      <TruncatedSidebarLabel text={row.title} className="min-w-0 flex-1" />
    </button>
  )
}
