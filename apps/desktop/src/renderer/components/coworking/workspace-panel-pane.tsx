import type React from 'react'
import type { CoworkingWorkspaceRoute } from '~renderer/components/coworking/types'
import { RightSidebarPanelContent } from '~renderer/components/workspace-panel/right-sidebar-panel-content'
import type {
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPageState
} from '~shared/coworking/catalog-contract'
import type { WorkspacePanelTabContentType } from '~shared/types'

import type { SourceControlPanelView } from '../workspace-panel/source-control/workspace-panel/state'
import type { CoworkingChecksReadState } from './checks-pane'
import { getCoworkingWorkspacePanelTabId } from './workspace-panel-tab'

export function CoworkingWorkspacePanelPane({
  panel,
  route,
  supportsGit,
  sessions,
  catalogStatus,
  checksState,
  sourceControlView,
  onSourceControlViewChange
}: {
  panel: WorkspacePanelTabContentType
  route: CoworkingWorkspaceRoute
  supportsGit: boolean
  sessions: readonly CoworkingSessionCatalogEntry[]
  catalogStatus: CoworkingSessionCatalogPageState['status']
  checksState: CoworkingChecksReadState
  sourceControlView: SourceControlPanelView
  onSourceControlViewChange: (view: SourceControlPanelView) => void
}): React.JSX.Element {
  return (
    <RightSidebarPanelContent
      effectiveTab={panel}
      rightSidebarOpen
      isVisible
      workspacePanelTabId={getCoworkingWorkspacePanelTabId(panel)}
      sourceControlView={sourceControlView}
      onSourceControlViewChange={onSourceControlViewChange}
      source={{
        kind: 'coworking',
        route,
        supportsGit,
        sessions,
        catalogStatus,
        checksState
      }}
    />
  )
}
