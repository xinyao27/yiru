import type React from 'react'
import { cn } from '@/lib/class-names'

export type WorktreeCardSurfaceActiveVariant = 'primary' | 'secondary'

type WorktreeCardSurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  density: 'title-only' | 'details'
  flush?: boolean
  activeVariant?: WorktreeCardSurfaceActiveVariant
  multiSelected?: boolean
  dropTarget?: boolean
  trailing?: React.ReactNode
}

export function WorktreeCardSurface({
  density,
  flush = false,
  activeVariant,
  multiSelected = false,
  dropTarget = false,
  trailing,
  className,
  children,
  ...props
}: WorktreeCardSurfaceProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative flex cursor-pointer flex-col transition-[background-color,border-color,opacity,box-shadow] duration-200 outline-none select-none',
        trailing ? 'pr-7' : 'pr-1.5',
        density === 'title-only' ? 'py-2' : 'pt-1.25 pb-1.5',
        flush ? 'ml-1 w-[calc(100%-0.25rem)]' : 'ml-1',
        'rounded-lg',
        dropTarget
          ? 'border border-accent-foreground/20 bg-accent/80'
          : activeVariant
            ? activeVariant === 'secondary'
              ? 'border border-sidebar-ring/25 bg-sidebar-accent/45 shadow-none ring-1 ring-sidebar-ring/15'
              : 'bg-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-black/[0.015] dark:bg-white/[0.10] dark:border-border/40 dark:shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
            : multiSelected
              ? 'border border-worktree-sidebar-ring/35 bg-worktree-sidebar-accent/70 ring-1 ring-worktree-sidebar-ring/30'
              : 'border border-transparent worktree-sidebar-card-hover',
        activeVariant && multiSelected && 'ring-1 ring-worktree-sidebar-ring/35',
        className
      )}
      data-worktree-card-surface="true"
      data-worktree-card-active={activeVariant}
      {...props}
    >
      {children}
      {trailing ? (
        // Why: workspace surfaces keep their established right padding while
        // disclosure controls align with project headers at the shared right inset.
        <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div>
      ) : null}
    </div>
  )
}
