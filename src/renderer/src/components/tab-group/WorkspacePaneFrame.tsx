import type React from 'react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'

type WorkspacePaneFrameProps = {
  worktreeId: string
  stripId: string
  tabBar: React.ReactNode
  trailingActions?: React.ReactNode
  reserveCollapsedSidebarHeaderSpace?: boolean
  reserveClosedExplorerToggleSpace?: boolean
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
  reserveClosedExplorerToggleSpace = false,
  rootClassName,
  rootProps,
  bodyClassName,
  bodyRef,
  bodyProps,
  children
}: WorkspacePaneFrameProps): React.JSX.Element {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)

  return (
    <div
      {...rootProps}
      className={cn(
        'group/tab-group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        rootClassName
      )}
    >
      {/* Why: local and shared worktrees use one pane strip so titlebar drag regions,
          control clearances, and tab alignment cannot drift between the two surfaces. */}
      <div
        className="h-[32px] shrink-0 border-b border-border bg-card"
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
          {reserveClosedExplorerToggleSpace && !rightSidebarOpen ? (
            <div
              className="shrink-0"
              style={
                {
                  width: 'calc(40px + var(--window-controls-width, 0px))',
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
