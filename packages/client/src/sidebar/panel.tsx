import React from 'react'
import { lazyWithRetry } from '~renderer/application-shell/lazy-with-retry'
import { FolderPlus } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'
import { TooltipProvider } from '~renderer/ui/tooltip'
import { SidebarResizeOverlay, useSidebarResize } from '~renderer/ui/use-resizable-sidebar'

import SidebarHeader from './header'
import SidebarNav from './nav'
import SetupScriptPromptCard from './setup-script-prompt-card'
import SidebarToolbar from './toolbar'
import { useSidebarProjectDrop } from './use-sidebar-project-drop'
import WorktreeList from './worktree-list'

const WorktreeMetaDialog = lazyWithRetry(() => import('./worktree-meta-dialog'))
const RemoveFolderDialog = lazyWithRetry(() => import('./remove-folder-dialog'))
const YiruYamlTrustDialog = lazyWithRetry(() => import('./yiru-yaml-trust-dialog'))

const MIN_WIDTH = 240
const MAX_WIDTH = 500
// Why: straddle the content seam and extend through the sibling titlebar so the
// visible sidebar has one uninterrupted drag target; the header is a drag region.
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME =
  'group absolute -top-[var(--titlebar-height)] bottom-0 z-10 flex w-3 cursor-col-resize items-stretch justify-center [-webkit-app-region:no-drag]'
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME =
  'h-full w-px bg-transparent transition-colors group-hover:bg-ring/50 group-active:bg-ring'

export type SidebarProps = {
  worktreeScrollOffsetRef: React.MutableRefObject<number>
  appearanceStyle?: React.CSSProperties
  navigationContent?: React.ReactNode
  placement?: 'left' | 'right'
  projectId?: string
  surface?: 'embedded-navigation' | 'navigation' | 'project-workspace' | 'workspace'
}

function Sidebar({
  worktreeScrollOffsetRef,
  appearanceStyle,
  navigationContent,
  placement = 'left',
  projectId,
  surface = 'workspace'
}: SidebarProps): React.JSX.Element {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const activeModal = useAppStore((s) => s.activeModal)
  const projectCatalog = useProjectCatalog()
  const { nativeDropTarget, dropHandlers, affordance } = useSidebarProjectDrop()
  const isBrowserNavigationSurface = surface === 'navigation'
  const isEmbeddedNavigationSurface = surface === 'embedded-navigation'
  const isNavigationSurface = isBrowserNavigationSurface || isEmbeddedNavigationSurface
  const isProjectWorkspaceSurface = surface === 'project-workspace'
  const isOpen = isNavigationSurface || sidebarOpen

  const { containerRef, onResizeStart, isResizing, renderedWidth } =
    useSidebarResize<HTMLDivElement>({
      isOpen,
      width: sidebarWidth,
      minWidth: MIN_WIDTH,
      maxWidth: MAX_WIDTH,
      deltaSign: placement === 'left' ? 1 : -1,
      setWidth: setSidebarWidth
    })

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        data-native-file-drop-target={isOpen ? nativeDropTarget : undefined}
        // Why: the outer seam matches the standard hairlines used by adjacent app panels.
        className={cn(
          'worktree-sidebar-theme bg-sidebar scrollbar-sleek-parent relative flex min-h-0 flex-shrink-0 flex-col',
          isNavigationSurface && 'h-full',
          isOpen &&
            !isBrowserNavigationSurface &&
            (placement === 'left' ? 'border-border border-r' : 'border-border border-l')
        )}
        style={{ ...appearanceStyle, width: isBrowserNavigationSurface ? '100%' : renderedWidth }}
        {...dropHandlers}
      >
        {/* Why: clip sidebar content without clipping the handle's titlebar extension. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {isOpen && (
            <>
              {/* Fixed controls */}
              {!isProjectWorkspaceSurface ? <SidebarNav /> : null}
              {!isProjectWorkspaceSurface ? navigationContent : null}
              <SidebarHeader
                canCreateWorkspace={projectCatalog.repos.length > 0}
                projectId={isProjectWorkspaceSurface ? projectId : undefined}
                showAddProject={!isProjectWorkspaceSurface}
              />

              <WorktreeList
                navigationSurface={isNavigationSurface}
                projectId={isProjectWorkspaceSurface ? projectId : undefined}
                scrollOffsetRef={worktreeScrollOffsetRef}
              />

              <SetupScriptPromptCard />

              {/* Fixed bottom toolbar */}
              {!isProjectWorkspaceSurface ? <SidebarToolbar /> : null}
            </>
          )}

          {isOpen && affordance.visible ? (
            <div
              className={cn(
                'pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-1.5 border bg-sidebar-accent px-4 text-center text-sidebar-accent-foreground',
                affordance.tone === 'blocked' ? 'border-destructive/70' : 'border-sidebar-ring/70'
              )}
            >
              {affordance.tone === 'busy' ? (
                <LoadingIndicator className="text-muted-foreground size-5" />
              ) : (
                <FolderPlus className="text-muted-foreground size-5" />
              )}
              <div className="text-sm font-medium">{affordance.label}</div>
              <div className="text-muted-foreground text-xs">{affordance.description}</div>
            </div>
          ) : null}
        </div>

        {/* Resize handle */}
        {isOpen && !isBrowserNavigationSurface && (
          <div
            data-sidebar-resize-handle=""
            className={cn(
              WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME,
              placement === 'left' ? '-right-1.5' : '-left-1.5',
              isResizing && 'bg-ring/10'
            )}
            onMouseDown={onResizeStart}
          >
            <div
              className={cn(
                WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME,
                isResizing && 'bg-ring'
              )}
            />
          </div>
        )}
      </div>

      <SidebarResizeOverlay visible={isResizing} />

      {/* Dialogs render outside sidebar to avoid clipping. Lazy-load them only
      for the modal that needs their flow-specific hooks and UI. */}
      <React.Suspense fallback={null}>
        {activeModal === 'edit-meta' ? <WorktreeMetaDialog /> : null}
        {activeModal === 'confirm-remove-folder' ? <RemoveFolderDialog /> : null}
        {activeModal === 'confirm-yiru-yaml-hooks' ? <YiruYamlTrustDialog /> : null}
      </React.Suspense>
    </TooltipProvider>
  )
}

export default Sidebar
