import { TerminalWindow as SquareTerminal } from '@phosphor-icons/react'
import type React from 'react'

import { AgentIcon } from '@/lib/agent-catalog'
import { cn } from '@/lib/class-names'

import type { SpoolSessionSidebarRow } from './spool-sidebar-rows'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import {
  DIRECT_PROJECT_WORKTREE_CONTENT_INDENT,
  SIDEBAR_TREE_INDENT
} from './worktree-list-indentation'

type SpoolSessionRowProps = {
  row: SpoolSessionSidebarRow
  onSelect: () => void
}

export function SpoolSessionRow({ row, onSelect }: SpoolSessionRowProps): React.JSX.Element {
  // Why: sessions remain one tree step beneath their flattened remote worktree.
  return (
    <button
      type="button"
      data-current={row.active ? 'true' : undefined}
      data-focused-agent-pane={row.active ? 'true' : undefined}
      aria-current={row.active ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'worktree-agent-row-hover flex h-6 w-full min-w-0 items-center gap-1 rounded-sm pr-1 text-left text-[11px] leading-none text-muted-foreground',
        'focus-visible:outline-none',
        row.active && 'text-foreground'
      )}
      style={{ paddingLeft: DIRECT_PROJECT_WORKTREE_CONTENT_INDENT + SIDEBAR_TREE_INDENT }}
    >
      <span aria-hidden="true" className="flex size-3.5 shrink-0 items-center justify-center">
        {row.kind === 'terminal' ? (
          <SquareTerminal className="size-3.5" />
        ) : (
          <AgentIcon agent={row.agent} size={13} />
        )}
      </span>
      <TruncatedSidebarLabel text={row.title} className="min-w-0 flex-1" />
    </button>
  )
}
