import { Suspense } from 'react'

import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useAppStore } from '@/store'

import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import { RightSidebarPanelContent } from '../workspace-panel/right-sidebar-panel-content'

const EditorPanel = lazy(() => import('../editor/editor-panel'))

export function WorkspacePanelTabContent({
  panel,
  panelTabId
}: {
  panel: WorkspacePanelTabContentType
  panelTabId: string
}): React.JSX.Element {
  const embedsEditor = panel === 'explorer' || panel === 'source-control'
  const activeFileId = useAppStore((state) => {
    const fileId = state.workspacePanelEditorFileIdByTab[panelTabId]
    return fileId && state.openFiles.some((file) => file.id === fileId) ? fileId : null
  })
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
            {activeFileId ? (
              <Suspense fallback={null}>
                <EditorPanel
                  activeFileId={activeFileId}
                  // Why: one workspace panel previews many files; include the
                  // file identity so Monaco does not reuse another file's view state.
                  activeViewStateId={`${panelTabId}:${activeFileId}`}
                />
              </Suspense>
            ) : null}
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
