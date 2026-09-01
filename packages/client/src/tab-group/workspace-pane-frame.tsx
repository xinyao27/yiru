import type React from 'react'
import { cn } from '~renderer/ui/class-names'

import { TAB_CONTENT_SURFACE_CLASSES } from '../tab-bar/tab-chrome-classes'
import { WorkspaceSidebarChromeSpacer } from '../workspace-panel/sidebar-chrome'

type WorkspacePaneFrameProps = {
  worktreeId: string
  stripId: string
  tabBar: React.ReactNode
  trailingActions?: React.ReactNode
  trailingActionsConnected?: boolean
  reserveCollapsedSidebarHeaderSpace?: boolean
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
  trailingActionsConnected = false,
  reserveCollapsedSidebarHeaderSpace = false,
  rootClassName,
  rootProps,
  bodyClassName,
  bodyRef,
  bodyProps,
  children
}: WorkspacePaneFrameProps): React.JSX.Element {
  return (
    <div
      {...rootProps}
      className={cn(
        'group/tab-group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        rootClassName
      )}
    >
      <div
        className="bg-background relative h-[var(--titlebar-height)] shrink-0"
        data-tab-group-strip-id={stripId}
        data-worktree-id={worktreeId}
      >
        {/* Why: inactive tabs reveal this seam while the opaque active tab covers it,
            visually connecting the selected tab to the workbench below. */}
        <div
          aria-hidden="true"
          className="bg-border pointer-events-none absolute inset-x-0 bottom-0 h-px"
        />
        {/* Why: the trailing titlebar action owns the pane edge without an inset gutter. */}
        <div className="relative flex h-full items-stretch">
          {reserveCollapsedSidebarHeaderSpace ? <WorkspaceSidebarChromeSpacer /> : null}
          <div className="h-full min-w-0 flex-1">{tabBar}</div>
          {trailingActions ? (
            <div
              className={cn(
                'flex shrink-0 items-center',
                trailingActionsConnected ? 'gap-0' : 'ml-1.5 gap-0.5'
              )}
            >
              {trailingActions}
            </div>
          ) : null}
        </div>
      </div>

      <div
        {...bodyProps}
        ref={bodyRef}
        // Why: tab content and the selected tab share the app canvas so the two
        // read as one continuous plane across every workspace content type.
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          TAB_CONTENT_SURFACE_CLASSES,
          bodyClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}
