import type React from 'react'

import type { SpoolWorkspaceRoute } from '@/components/spool/types'
import { RightSidebarPanelContent } from '@/components/workspace-panel/right-sidebar-panel-content'

import type {
  SpoolSessionCatalogEntry,
  SpoolSessionCatalogPageState
} from '../../../../shared/spool/spool-catalog-contract'
import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import type { SpoolChecksReadState } from './checks-pane'

export function SpoolWorkspacePanelPane({
  panel,
  route,
  supportsGit,
  sessions,
  catalogStatus,
  checksState
}: {
  panel: WorkspacePanelTabContentType
  route: SpoolWorkspaceRoute
  supportsGit: boolean
  sessions: readonly SpoolSessionCatalogEntry[]
  catalogStatus: SpoolSessionCatalogPageState['status']
  checksState: SpoolChecksReadState
}): React.JSX.Element {
  return (
    <RightSidebarPanelContent
      effectiveTab={panel}
      rightSidebarOpen
      isVisible
      source={{
        kind: 'spool',
        route,
        supportsGit,
        sessions,
        catalogStatus,
        checksState
      }}
    />
  )
}
