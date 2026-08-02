import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '~renderer/lib/lazy-with-retry'
import { useAppStore } from '~renderer/store'
import type { WorkspacePanelTabContentType } from '~shared/types'

import { RightSidebarPanelContent } from '../workspace-panel/right-sidebar-panel-content'
import { WorkspacePanelEditorEmptyState } from './workspace-panel-editor-empty-state'
import { WorkspacePanelSidePanel } from './workspace-panel-side-panel'

const EditorPanel = lazy(() => import('../editor/panel'))
const GitGraphView = lazy(() => import('../workspace-panel/git-graph/view'))

export function WorkspacePanelTabContent({
  panel,
  panelTabId,
  worktreeId,
  groupId,
  onNewTerminalTab,
  onNewBrowserTab
}: {
  panel: WorkspacePanelTabContentType
  panelTabId: string
  worktreeId: string
  groupId: string
  onNewTerminalTab: () => void
  onNewBrowserTab: () => void
}): React.JSX.Element {
  const embedsEditor = panel === 'explorer' || panel === 'source-control'
  const activeFileId = useAppStore((state) => {
    const fileId = state.workspacePanelEditorFileIdByTab[panelTabId]
    return fileId && state.openFiles.some((file) => file.id === fileId) ? fileId : null
  })
  const isGitGraphOpen = useAppStore((state) =>
    panel === 'source-control' ? (state.gitGraphOpenByPanelTab[panelTabId] ?? false) : false
  )

  return (
    <div
      // Why: workspace panels are fully interactive surfaces; marking the body
      // as terminal-release chrome makes Electron drag the window on clicks.
      className="bg-background text-foreground absolute inset-0 flex min-h-0 min-w-0"
    >
      {embedsEditor ? (
        <>
          <div className="bg-background flex min-h-0 min-w-0 flex-1">
            {isGitGraphOpen ? (
              <Suspense fallback={null}>
                <GitGraphView worktreeId={worktreeId} workspacePanelTabId={panelTabId} />
              </Suspense>
            ) : activeFileId ? (
              <Suspense fallback={null}>
                <EditorPanel
                  activeFileId={activeFileId}
                  // Why: one workspace panel previews many files; include the
                  // file identity so the editor cannot reuse another file's view state.
                  activeViewStateId={`${panelTabId}:${activeFileId}`}
                />
              </Suspense>
            ) : (
              <WorkspacePanelEditorEmptyState
                worktreeId={worktreeId}
                groupId={groupId}
                onNewTerminalTab={onNewTerminalTab}
                onNewBrowserTab={onNewBrowserTab}
              />
            )}
          </div>
          <WorkspacePanelSidePanel panel={panel} panelTabId={panelTabId} />
        </>
      ) : (
        <RightSidebarPanelContent effectiveTab={panel} rightSidebarOpen isVisible />
      )}
    </div>
  )
}
