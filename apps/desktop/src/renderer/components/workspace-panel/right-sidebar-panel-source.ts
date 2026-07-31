import type { CoworkingChecksReadState } from '~renderer/components/coworking/checks-pane'
import type { CoworkingWorkspaceRoute } from '~renderer/components/coworking/types'
import type {
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPageState
} from '~shared/coworking/catalog-contract'

export type RightSidebarPanelSource =
  | { kind: 'local' }
  | {
      kind: 'coworking'
      route: CoworkingWorkspaceRoute
      supportsGit: boolean
      sessions: readonly CoworkingSessionCatalogEntry[]
      catalogStatus: CoworkingSessionCatalogPageState['status']
      checksState: CoworkingChecksReadState
    }

export const LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE: RightSidebarPanelSource = { kind: 'local' }
