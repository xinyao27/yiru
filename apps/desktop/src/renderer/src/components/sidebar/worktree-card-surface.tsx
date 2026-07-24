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
        'data-[worktree-card-active=primary]:border-[color:color-mix(in_srgb,var(--sidebar-border)_40%,transparent)] data-[worktree-card-active=primary]:bg-[color-mix(in_srgb,var(--sidebar-foreground)_8%,transparent)] dark:data-[worktree-card-active=primary]:bg-[color-mix(in_srgb,var(--sidebar-foreground)_10%,transparent)]',
        'data-[worktree-card-active=secondary]:border-[color:color-mix(in_srgb,var(--sidebar-ring)_25%,transparent)] data-[worktree-card-active=secondary]:bg-[color-mix(in_srgb,var(--sidebar-accent)_45%,transparent)] dark:data-[worktree-card-active=secondary]:border-[color:color-mix(in_srgb,var(--sidebar-ring)_28%,transparent)] dark:data-[worktree-card-active=secondary]:bg-[color-mix(in_srgb,var(--sidebar-accent)_34%,transparent)]',
        trailing ? 'pr-7' : 'pr-1.5',
        density === 'title-only' ? 'py-2' : 'pt-1.25 pb-1.5',
        // Why: flush workspace backgrounds share the full-row grid with project headers.
        flush ? 'w-full' : 'ml-1',
        dropTarget
          ? 'border border-accent-foreground/20 bg-accent/80'
          : multiSelected
            ? 'border-ring/35 bg-accent border'
            : 'border border-transparent [&:not([data-worktree-card-active]):hover]:bg-accent',
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
