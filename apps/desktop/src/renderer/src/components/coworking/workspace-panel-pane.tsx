import type React from 'react'

import type { CoworkingWorkspaceRoute } from '@/components/coworking/types'
import { RightSidebarPanelContent } from '@/components/workspace-panel/right-sidebar-panel-content'

import type {
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPageState
} from '../../../../shared/coworking/catalog-contract'
import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import type { CoworkingChecksReadState } from './checks-pane'

export function CoworkingWorkspacePanelPane({
  panel,
  route,
  supportsGit,
  sessions,
  catalogStatus,
  checksState
}: {
  panel: WorkspacePanelTabContentType
  route: CoworkingWorkspaceRoute
  supportsGit: boolean
  sessions: readonly CoworkingSessionCatalogEntry[]
  catalogStatus: CoworkingSessionCatalogPageState['status']
  checksState: CoworkingChecksReadState
}): React.JSX.Element {
  return (
    <RightSidebarPanelContent
      effectiveTab={panel}
      rightSidebarOpen
      isVisible
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
