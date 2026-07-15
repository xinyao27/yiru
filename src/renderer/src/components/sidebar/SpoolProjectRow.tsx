import type React from 'react'
import { ChevronRight, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolProjectSidebarRow } from './spool-sidebar-rows'
import { getProjectGroupHeaderPaddingLeft } from './worktree-list-indentation'

type SpoolProjectRowProps = {
  row: SpoolProjectSidebarRow
  onToggle: () => void
}

export function SpoolProjectRow({ row, onToggle }: SpoolProjectRowProps): React.JSX.Element {
  const hasWorktrees = row.worktreeCount > 0
  return (
    <button
      type="button"
      disabled={!hasWorktrees}
      aria-expanded={hasWorktrees ? row.expanded : undefined}
      onClick={onToggle}
      className={cn(
        'flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left',
        'text-[13px] font-semibold leading-none text-worktree-sidebar-foreground transition-colors',
        'hover:bg-worktree-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
        'disabled:cursor-default disabled:hover:bg-transparent'
      )}
      style={{ paddingLeft: getProjectGroupHeaderPaddingLeft(0) }}
    >
      <Folder aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <TruncatedSidebarLabel text={row.name} className="min-w-0 flex-1" />
      {hasWorktrees ? (
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
            row.expanded && 'rotate-90'
          )}
        />
      ) : null}
    </button>
  )
}
