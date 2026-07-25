import type { RefObject } from 'react'
import React, { Suspense } from 'react'
import { createPortal } from 'react-dom'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'

import type {
  BrowserTab,
  TerminalTab,
  TopLevelView,
  WorkspaceVisibleTabType
} from '../../../../shared/types'
import {
  findActivityTerminalPortal,
  type ActivityTerminalPortalTarget
} from '../activity/terminal-portal'
import BrowserPane from '../browser-pane/browser-pane'
import CodexRestartChip from '../codex-restart-chip'
import type { OpenFile } from '../editor/state'
import TerminalPane from '../terminal-pane/terminal-pane'
import { shouldMountBackgroundWorktreeTab } from '../terminal/background-terminal-worktree-mount'

const EditorPanel = lazy(() => import('../editor/panel'))

type WorkspaceSurface = { id: string; path: string }

type LegacyWorkspaceSurfacesProps = {
  workspaceSurfaces: WorkspaceSurface[]
  mountedWorktreeIdsRef: RefObject<Set<string>>
  measurableBackgroundWorktreeIdsRef: RefObject<Set<string>>
  parkedTerminalWorktreeIds: ReadonlySet<string>
  backgroundMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  activityTerminalPortals: ActivityTerminalPortalTarget[]
  activeView: TopLevelView
  activeWorktreeId: string | null
  activeTabId: string | null
  activeTabType: WorkspaceVisibleTabType
  tabsByWorktree: Record<string, TerminalTab[]>
  browserTabsByWorktree: Record<string, BrowserTab[]>
  activeBrowserTabId: string | null
  worktreeFiles: OpenFile[]
  worktreeBrowserTabCount: number
  onPtyExit: (tabId: string, ptyId: string) => void
  onCloseTab: (tabId: string) => void
}

// Why: split-group layouts render their own terminal/browser/editor surfaces
// through TabGroupPanel plus stable overlay layers. Keeping the legacy
// workspace-level panes mounted underneath as hidden DOM creates duplicate
// TerminalPane/BrowserPane instances for the same tab, which lets two React
// trees race over one PTY or webview — so the caller renders only one
// surface model at a time (see anyMountedWorktreeHasLayout in panel.tsx).
export function LegacyWorkspaceSurfaces({
  workspaceSurfaces,
  mountedWorktreeIdsRef,
  measurableBackgroundWorktreeIdsRef,
  parkedTerminalWorktreeIds,
  backgroundMountTabIdsByWorktreeRef,
  activityTerminalPortals,
  activeView,
  activeWorktreeId,
  activeTabId,
  activeTabType,
  tabsByWorktree,
  browserTabsByWorktree,
  activeBrowserTabId,
  worktreeFiles,
  worktreeBrowserTabCount,
  onPtyExit,
  onCloseTab
}: LegacyWorkspaceSurfacesProps): React.JSX.Element {
  return (
    <>
      {/* Terminal panes container - hidden when editor tab active */}
      <div
        className={cn(
          'relative flex-1 min-h-0 overflow-hidden',
          (activeTabType === 'editor' && worktreeFiles.length > 0) ||
            (activeTabType === 'browser' && worktreeBrowserTabCount > 0) ||
            activeTabType === 'simulator'
            ? 'hidden'
            : ''
        )}
      >
        {workspaceSurfaces
          .filter((workspace) => mountedWorktreeIdsRef.current.has(workspace.id))
          .map((workspace) => {
            // Why: strict equality keeps preserved workspace surfaces hidden
            // behind every non-terminal top-level view.
            const isVisible = activeView === 'terminal' && workspace.id === activeWorktreeId
            const shouldMeasureHiddenWorktree =
              !isVisible && measurableBackgroundWorktreeIdsRef.current.has(workspace.id)
            const shouldColdParkTerminalPanes =
              !isVisible &&
              !shouldMeasureHiddenWorktree &&
              parkedTerminalWorktreeIds.has(workspace.id)
            return (
              <div
                key={workspace.id}
                className={
                  isVisible
                    ? 'absolute inset-0'
                    : shouldMeasureHiddenWorktree
                      ? 'pointer-events-none absolute inset-0 opacity-0'
                      : 'absolute inset-0 hidden'
                }
                aria-hidden={!isVisible}
              >
                <CodexRestartChip isVisible={isVisible} worktreeId={workspace.id} />
                {(tabsByWorktree[workspace.id] ?? [])
                  .filter((tab) =>
                    shouldMountBackgroundWorktreeTab(
                      backgroundMountTabIdsByWorktreeRef.current.get(workspace.id) ?? null,
                      tab.id
                    )
                  )
                  .map((tab) => {
                    const activityTerminalPortal = findActivityTerminalPortal(
                      activityTerminalPortals,
                      { worktreeId: workspace.id, tabId: tab.id }
                    )
                    const isActivityPortalTab = activityTerminalPortal !== null
                    const isActiveTerminalTab =
                      isVisible && tab.id === activeTabId && activeTabType === 'terminal'
                    // Why: parking unmounts the view while preserving the PTY;
                    // an Activity portal remains mounted as a visible consumer.
                    if (shouldColdParkTerminalPanes && !isActivityPortalTab) {
                      return null
                    }
                    const terminalPane = (
                      <TerminalPane
                        key={`${tab.id}-${tab.generation ?? 0}`}
                        tabId={tab.id}
                        worktreeId={workspace.id}
                        cwd={tab.startupCwd ?? workspace.path}
                        isActive={isActiveTerminalTab || activityTerminalPortal?.active === true}
                        // Why: the activity page hosts this existing pane via
                        // portal while the workspace surface remains hidden.
                        // Keeping `isVisible` true for the portaled tab lets
                        // xterm fit and stream foreground output in-place.
                        isVisible={isActiveTerminalTab || isActivityPortalTab}
                        // Why: inactive tabs in the visible legacy surface
                        // are tab-hidden, not worktree-hidden, so they need
                        // the same light resume path as split-group overlays.
                        isWorktreeActive={isVisible || isActivityPortalTab}
                        // Why: when portaled to Activity for a specific agent
                        // pane, isolate that leaf so split siblings stay
                        // hidden. Workspace renders pass null → no override.
                        isolatedPaneKey={activityTerminalPortal?.paneKey ?? null}
                        onPtyExit={(ptyId) => onPtyExit(tab.id, ptyId)}
                        onCloseTab={() => onCloseTab(tab.id)}
                      />
                    )
                    if (activityTerminalPortal) {
                      return createPortal(
                        terminalPane,
                        activityTerminalPortal.target,
                        `activity-terminal-${tab.id}`
                      )
                    }
                    return terminalPane
                  })}
              </div>
            )
          })}
      </div>

      {/* Browser panes container — only the active pane mounts so inactive
          webviews park into the bounded registry instead of keeping hidden
          Electron guest renderers alive indefinitely. */}
      <div
        className={cn(
          'relative flex-1 min-h-0 overflow-hidden',
          activeTabType !== 'browser' ? 'hidden' : ''
        )}
      >
        {workspaceSurfaces.map((workspace) => {
          const browserTabs = browserTabsByWorktree[workspace.id] ?? []
          // Why: strict equality also hides preserved browser panes behind
          // every non-terminal top-level view.
          const isVisibleWorktree = activeView === 'terminal' && workspace.id === activeWorktreeId
          if (browserTabs.length === 0) {
            return null
          }
          return (
            <div
              key={`browser-${workspace.id}`}
              className={isVisibleWorktree ? 'absolute inset-0' : 'absolute inset-0 hidden'}
              aria-hidden={!isVisibleWorktree}
            >
              {browserTabs.map((browserTab) => {
                const isBrowserActive =
                  isVisibleWorktree &&
                  activeTabType === 'browser' &&
                  browserTab.id === activeBrowserTabId
                return (
                  <div
                    key={browserTab.id}
                    className={cn(
                      'absolute inset-0',
                      isBrowserActive ? '' : 'pointer-events-none hidden'
                    )}
                  >
                    {isBrowserActive ? (
                      <BrowserPane browserTab={browserTab} isActive={isBrowserActive} />
                    ) : null}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {activeWorktreeId && activeTabType === 'editor' && worktreeFiles.length > 0 && (
        <Suspense
          fallback={
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              {translate('auto.components.Terminal.5c1d2a32bb', 'Loading editor...')}
            </div>
          }
        >
          <EditorPanel />
        </Suspense>
      )}
    </>
  )
}
