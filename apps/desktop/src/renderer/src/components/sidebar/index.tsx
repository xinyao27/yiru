import React, { useEffect, useMemo } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { FolderPlus } from '@/components/regular-icons'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'
import type { VirtualizedScrollAnchor } from '@/hooks/use-virtualized-scroll-anchor'
import { cn } from '@/lib/class-names'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import { resolveLeftSidebarStyleVariables } from '@/lib/left-sidebar-appearance'
import { useAppStore } from '@/store'

import SetupScriptPromptCard from './setup-script-prompt-card'
import SidebarHeader from './sidebar-header'
import SidebarNav from './sidebar-nav'
import SidebarToolbar from './sidebar-toolbar'
import { useSidebarProjectDrop } from './use-sidebar-project-drop'
import WorktreeList from './worktree-list'

const WorktreeMetaDialog = lazyWithRetry(() => import('./worktree-meta-dialog'))
const RemoveFolderDialog = lazyWithRetry(() => import('./remove-folder-dialog'))
const WorktreeVisibilityDialog = lazyWithRetry(() => import('./worktree-visibility-dialog'))
const YiruYamlTrustDialog = lazyWithRetry(() => import('./yiru-yaml-trust-dialog'))
const ForgetSshWorkspaceDialog = lazyWithRetry(() => import('./forget-ssh-workspace-dialog'))

const MIN_WIDTH = 220
const MAX_WIDTH = 500
// Why: straddle the sidebar/terminal seam so the divider sits on the border-l
// instead of leaving a blank strip between the hover target and the edge.
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME =
  'group absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize items-stretch justify-center'
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME =
  'h-full w-px bg-transparent transition-colors group-hover:bg-ring/50 group-active:bg-ring'

type SidebarProps = {
  worktreeScrollOffsetRef: React.MutableRefObject<number>
  worktreeScrollAnchorRef: React.MutableRefObject<VirtualizedScrollAnchor>
}

function Sidebar({
  worktreeScrollOffsetRef,
  worktreeScrollAnchorRef
}: SidebarProps): React.JSX.Element {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const repos = useAppStore((s) => s.repos)
  const settings = useAppStore((s) => s.settings)
  const fetchAllWorktrees = useAppStore((s) => s.fetchAllWorktrees)
  const activeModal = useAppStore((s) => s.activeModal)
  const systemPrefersDark = useSystemPrefersDark()
  const leftSidebarStyle = useMemo(
    () => resolveLeftSidebarStyleVariables(settings, systemPrefersDark),
    [settings, systemPrefersDark]
  ) as React.CSSProperties | undefined
  const { nativeDropTarget, dropHandlers, affordance } = useSidebarProjectDrop()

  const setLiveSidebarWidth = React.useCallback((width: number) => {
    document.documentElement.style.setProperty('--workspace-sidebar-live-width', `${width}px`)
  }, [])

  // Fetch worktrees when repos are added/removed
  const repoCount = repos.length
  useEffect(() => {
    if (repoCount > 0) {
      fetchAllWorktrees()
    }
  }, [repoCount, fetchAllWorktrees])

  // Why: a runtime host coming online/offline must refresh the sidebar so its
  // worktrees appear/drop, the same way SSH state changes already refetch. Only
  // the manual connect button refetched before, so the list went stale until the
  // user forced a refetch (e.g. via Add Project). React to the set of online
  // runtime envs (a host has a status entry once it is connected).
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const fetchWorktreeLineage = useAppStore((s) => s.fetchWorktreeLineage)
  const onlineRuntimeEnvKey = React.useMemo(
    () =>
      // Why: tolerate an absent map — a partial/hydrating store can leave this
      // undefined, and a thrown selector would crash the whole sidebar render.
      [...(runtimeStatusByEnvironmentId?.entries() ?? [])]
        .filter(([, entry]) => Boolean(entry?.status))
        .map(([id]) => id)
        .sort()
        .join(','),
    [runtimeStatusByEnvironmentId]
  )
  const previousOnlineRuntimeEnvKeyRef = React.useRef<string | null>(null)
  useEffect(() => {
    // Skip the initial value — startup/repoCount effects already fetch. Only
    // refetch when the online-host set actually changes.
    if (previousOnlineRuntimeEnvKeyRef.current === null) {
      previousOnlineRuntimeEnvKeyRef.current = onlineRuntimeEnvKey
      return
    }
    if (previousOnlineRuntimeEnvKeyRef.current === onlineRuntimeEnvKey) {
      return
    }
    previousOnlineRuntimeEnvKeyRef.current = onlineRuntimeEnvKey
    void fetchAllWorktrees().then(() => fetchWorktreeLineage())
  }, [onlineRuntimeEnvKey, fetchAllWorktrees, fetchWorktreeLineage])

  const { containerRef, onResizeStart, isResizing } = useSidebarResize<HTMLDivElement>({
    isOpen: sidebarOpen,
    width: sidebarWidth,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    deltaSign: 1,
    setWidth: setSidebarWidth,
    onDraftWidthChange: setLiveSidebarWidth
  })

  return (
    <TooltipProvider delay={400}>
      <div
        ref={containerRef}
        data-native-file-drop-target={sidebarOpen ? nativeDropTarget : undefined}
        className="worktree-sidebar-theme bg-sidebar scrollbar-sleek-parent relative flex min-h-0 flex-shrink-0 flex-col overflow-hidden"
        style={leftSidebarStyle}
        {...dropHandlers}
      >
        {sidebarOpen && (
          <>
            {/* Fixed controls */}
            <SidebarNav />
            <SidebarHeader />

            <WorktreeList
              scrollOffsetRef={worktreeScrollOffsetRef}
              scrollAnchorRef={worktreeScrollAnchorRef}
            />

            <SetupScriptPromptCard />

            {/* Fixed bottom toolbar */}
            <SidebarToolbar />
          </>
        )}

        {sidebarOpen && affordance.visible ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-1.5 rounded-md border bg-sidebar-accent px-4 text-center text-sidebar-accent-foreground shadow-xs',
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

        {/* Resize handle */}
        {sidebarOpen && (
          <div
            data-sidebar-resize-handle=""
            className={cn(WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME, isResizing && 'bg-ring/10')}
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

      {/* Dialogs render outside sidebar to avoid clipping. Lazy-load them only
      for the modal that needs their flow-specific hooks and UI. */}
      <React.Suspense fallback={null}>
        {activeModal === 'edit-meta' ? <WorktreeMetaDialog /> : null}
        {activeModal === 'confirm-remove-folder' ? <RemoveFolderDialog /> : null}
        {activeModal === 'worktree-visibility' ? <WorktreeVisibilityDialog /> : null}
        {activeModal === 'confirm-yiru-yaml-hooks' ? <YiruYamlTrustDialog /> : null}
        {activeModal === 'forget-ssh-workspace' ? <ForgetSshWorkspaceDialog /> : null}
      </React.Suspense>
    </TooltipProvider>
  )
}

export default React.memo(Sidebar)
