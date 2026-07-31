import { Suspense } from 'react'

import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useAppStore } from '@/store'

import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import { RightSidebarPanelContent } from '../workspace-panel/right-sidebar-panel-content'
import { WorkspacePanelEditorEmptyState } from './workspace-panel-editor-empty-state'

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
  const panelWidth = useAppStore((state) => state.rightSidebarWidth)

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
                  // file identity so Monaco does not reuse another file's view state.
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
          <div
            // Why: the former right-sidebar width remains the user's preferred
            // tree width, while the cap preserves usable editor space in splits.
            className="bg-sidebar text-sidebar-foreground border-border flex min-h-0 shrink-0 border-l"
            style={{ width: panelWidth, maxWidth: '50%' }}
          >
            <RightSidebarPanelContent
              effectiveTab={panel}
              rightSidebarOpen
              isVisible
              workspacePanelTabId={panelTabId}
            />
          </div>
        </>
      ) : (
        <RightSidebarPanelContent effectiveTab={panel} rightSidebarOpen isVisible />
      )}
    </div>
  )
}
