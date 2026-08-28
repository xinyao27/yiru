import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import type { ActiveRightSidebarTab } from '~renderer/editor/state'

import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from './right-sidebar-panel-source'
import type { SourceControlPanelView } from './source-control/workspace-panel/state'

const FileExplorer = lazy(() => import('./file-explorer'))
const SourceControlWorkspacePanel = lazy(() => import('./source-control/workspace-panel/panel'))
const PortsPanel = lazy(() => import('./ports-panel'))
const AiVaultPanel = lazy(() => import('./ai-vault/panel'))
const FolderWorkspaceWorktreesPanel = lazy(() => import('./folder-workspace-worktrees-panel'))
const FolderWorkspacePrChecksPanel = lazy(() => import('./folder-workspace-pr-checks-panel'))

type RightSidebarPanelContentProps = {
  effectiveTab: ActiveRightSidebarTab
  rightSidebarOpen: boolean
  isVisible?: boolean
  source?: RightSidebarPanelSource
  workspacePanelTabId?: string
  sourceControlView?: SourceControlPanelView
  onSourceControlViewChange?: (view: SourceControlPanelView) => void
}

export function RightSidebarPanelContent({
  effectiveTab,
  rightSidebarOpen,
  isVisible,
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  workspacePanelTabId,
  sourceControlView,
  onSourceControlViewChange
}: RightSidebarPanelContentProps): React.JSX.Element {
  const panelVisible = isVisible ?? rightSidebarOpen
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        {effectiveTab === 'explorer' && (
          <FileExplorer
            source={source}
            isVisible={panelVisible}
            workspacePanelTabId={workspacePanelTabId}
          />
        )}
        {effectiveTab === 'source-control' && (
          <SourceControlWorkspacePanel
            source={source}
            isVisible={panelVisible}
            workspacePanelTabId={workspacePanelTabId}
            view={sourceControlView}
            onViewChange={onSourceControlViewChange}
          />
        )}
        {effectiveTab === 'ports' && (
          <PortsPanel isVisible={panelVisible && effectiveTab === 'ports'} />
        )}
        {effectiveTab === 'vault' && <AiVaultPanel source={source} />}
        {effectiveTab === 'workspaces' && <FolderWorkspaceWorktreesPanel />}
        {effectiveTab === 'pr-checks' && (
          <FolderWorkspacePrChecksPanel isVisible={panelVisible && effectiveTab === 'pr-checks'} />
        )}
      </Suspense>
    </div>
  )
}
