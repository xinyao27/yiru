import type React from 'react'
import { isExtensionRenderer } from '~renderer/runtime/renderer-host'
import { useAppStore } from '~renderer/store/state'
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
  trailingActionsConnected = false,
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
  const workspaceSidebarOnLeft = isExtensionRenderer()
  const reserveLeadingWorktreeChrome =
    reserveCollapsedSidebarHeaderSpace && !workspaceSidebarOnLeft && !sidebarOpen
  const reserveLeadingWorkspaceChrome = reserveCollapsedSidebarHeaderSpace && workspaceSidebarOnLeft
  const reserveDesktopWindowControls = reserveWindowControlsSpace && !workspaceSidebarOnLeft

  return (
    <div
      {...rootProps}
      className={cn(
        'group/tab-group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        rootClassName
      )}
    >
      {/* Why: every workspace strip reveals the same native material as the left
          sidebar when available, while unsupported platforms keep the app canvas. */}
      <div
        className="bg-background relative h-[var(--titlebar-height)] shrink-0 [[data-native-sidebar-material=true]_&]:bg-transparent"
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
          {reserveLeadingWorktreeChrome ? <WorktreeSidebarChromeSpacer /> : null}
          {reserveLeadingWorkspaceChrome ? <WorkspaceSidebarChromeSpacer /> : null}
          {/* Why: only the tab strip is a window-drag / terminal-focus-release
              surface. Trailing pin/Open in/More chrome must stay no-drag so
              pointer and HTML5 interaction are not eaten by Electron. */}
          <div className="h-full min-w-0 flex-1" data-terminal-focus-release-surface="true">
            {tabBar}
          </div>
          {trailingActions ? (
            <div
              className={cn(
                'flex shrink-0 items-center [-webkit-app-region:no-drag]',
                trailingActionsConnected ? 'gap-0' : 'ml-1.5 gap-0.5'
              )}
            >
              {trailingActions}
            </div>
          ) : null}
          {reserveDesktopWindowControls ? <WorkspaceSidebarChromeSpacer /> : null}
          {reserveDesktopWindowControls ? (
            <div
              className="shrink-0 [-webkit-app-region:no-drag]"
              // Why: native controls overlay the renderer on Windows/Linux.
              style={{ width: 'var(--window-controls-width, 0px)' }}
            />
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

function WorktreeSidebarChromeSpacer(): React.JSX.Element {
  return (
    <div className="w-[var(--collapsed-sidebar-header-width)] shrink-0 [-webkit-app-region:no-drag]" />
  )
}
