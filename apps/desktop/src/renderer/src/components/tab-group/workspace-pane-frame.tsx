import type React from 'react'

import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'

type WorkspacePaneFrameProps = {
  worktreeId: string
  stripId: string
  tabBar: React.ReactNode
  trailingActions?: React.ReactNode
  reserveCollapsedSidebarHeaderSpace?: boolean
  reserveWindowControlsSpace?: boolean
  rootClassName?: string
  rootProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>
  bodyClassName?: string
  bodyRef?: React.Ref<HTMLDivElement>
  bodyProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> & {
    'data-tab-group-body-id'?: string
    'data-worktree-id'?: string
  }
  children: React.ReactNode
}

export function WorkspacePaneFrame({
  worktreeId,
  stripId,
  tabBar,
  trailingActions,
  reserveCollapsedSidebarHeaderSpace = false,
  reserveWindowControlsSpace = false,
  rootClassName,
  rootProps,
  bodyClassName,
  bodyRef,
  bodyProps,
  children
}: WorkspacePaneFrameProps): React.JSX.Element {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)

  return (
    <div
      {...rootProps}
      className={cn(
        'group/tab-group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        rootClassName
      )}
    >
      {/* Why: every workspace strip reveals the same native material as the left
          sidebar when available, while unsupported platforms keep the card fallback. */}
      <div
        className="border-border bg-card h-10 shrink-0 border-b [[data-native-sidebar-material=true]_&]:bg-transparent"
        data-tab-group-strip-id={stripId}
        data-terminal-focus-release-surface="true"
        data-worktree-id={worktreeId}
      >
        <div className="flex h-full items-stretch pr-1.5">
          {reserveCollapsedSidebarHeaderSpace && !sidebarOpen ? (
            <div
              className="shrink-0"
              style={
                {
                  width: 'var(--collapsed-sidebar-header-width)',
                  WebkitAppRegion: 'no-drag'
                } as React.CSSProperties
              }
            />
          ) : null}
          <div className="h-full min-w-0 flex-1">{tabBar}</div>
          {trailingActions ? (
            <div
              className="ml-1.5 flex shrink-0 items-center gap-0.5"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {trailingActions}
            </div>
          ) : null}
          {reserveWindowControlsSpace ? (
            <div
              className="shrink-0"
              // Why: native controls overlay the renderer on Windows/Linux;
              // a collapsed left sidebar also moves the profile control here.
              style={
                {
                  width: sidebarOpen
                    ? 'var(--window-controls-width, 0px)'
                    : 'calc(40px + var(--window-controls-width, 0px))',
                  WebkitAppRegion: 'no-drag'
                } as React.CSSProperties
              }
            />
          ) : null}
        </div>
      </div>

      <div
        {...bodyProps}
        ref={bodyRef}
        className={cn('relative min-h-0 flex-1 overflow-hidden', bodyClassName)}
      >
        {children}
      </div>
    </div>
  )
}
