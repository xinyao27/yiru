import type React from 'react'
import { ChevronRight, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolProjectSidebarRow } from './spool-sidebar-rows'

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
        'flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md py-1 pl-4 pr-1.5 text-left',
        'text-[13px] text-worktree-sidebar-foreground transition-colors',
        'hover:bg-worktree-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
        'disabled:cursor-default disabled:hover:bg-transparent'
      )}
    >
      <ChevronRight
        aria-hidden="true"
        className={cn(
          'size-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
          row.expanded && 'rotate-90'
        )}
      />
      <Folder aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <TruncatedSidebarLabel text={row.name} className="min-w-0 flex-1 font-medium" />
    </button>
  )
}
