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
        'relative flex cursor-pointer flex-col transition-[background-color,border-color,opacity] duration-200 outline-none select-none',
        trailing ? 'pr-7' : 'pr-1.5',
        density === 'title-only' ? 'py-2' : 'pt-1.25 pb-1.5',
        flush ? 'ml-1 w-[calc(100%-0.25rem)]' : 'ml-1',
        'rounded-lg',
        dropTarget
          ? 'border border-accent-foreground/20 bg-accent/80'
          : activeVariant
            ? activeVariant === 'secondary'
              ? 'border border-sidebar-ring/25 bg-sidebar-accent/45'
              : 'border border-black/[0.015] bg-black/[0.08] dark:border-border/40 dark:bg-white/[0.10]'
            : multiSelected
              ? 'border border-sidebar-ring/35 bg-sidebar-accent/70'
              : 'border border-transparent worktree-sidebar-card-hover',
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
        <div className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</div>
      ) : null}
    </div>
  )
}
