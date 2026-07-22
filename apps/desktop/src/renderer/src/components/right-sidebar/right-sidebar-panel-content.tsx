import { Suspense } from 'react'

import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'

import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from './right-sidebar-panel-source'

const FileExplorer = lazy(() => import('./file-explorer'))
const SourceControl = lazy(() => import('./source-control'))
const ChecksPanel = lazy(() => import('./checks-panel'))
const PortsPanel = lazy(() => import('./ports-panel'))
const AiVaultPanel = lazy(() => import('./ai-vault-panel'))
const FolderWorkspaceWorktreesPanel = lazy(() => import('./folder-workspace-worktrees-panel'))
const FolderWorkspacePrChecksPanel = lazy(() => import('./folder-workspace-pr-checks-panel'))

type RightSidebarPanelContentProps = {
  effectiveTab: ActiveRightSidebarTab
  rightSidebarOpen: boolean
  isVisible?: boolean
  source?: RightSidebarPanelSource
}

export function RightSidebarPanelContent({
  effectiveTab,
  rightSidebarOpen,
  isVisible,
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE
}: RightSidebarPanelContentProps): React.JSX.Element {
  const panelVisible = isVisible ?? rightSidebarOpen
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        {effectiveTab === 'explorer' && <FileExplorer source={source} isVisible={panelVisible} />}
        {effectiveTab === 'source-control' && (
          <SourceControl source={source} isVisible={panelVisible} />
        )}
        {effectiveTab === 'checks' && <ChecksPanel source={source} isVisible={panelVisible} />}
        {/* Why: SSH port forwarding still depends on the raw ports.detect data,
            which the workspace-scoped status bar popover intentionally does not
            expose. Keep this panel reachable only for SSH worktrees. */}
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
