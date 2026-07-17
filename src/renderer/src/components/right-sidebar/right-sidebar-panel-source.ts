import type {
  SpoolSessionCatalogEntry,
  SpoolSessionCatalogPageState
} from '../../../../shared/spool/spool-catalog-contract'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import type { SpoolChecksReadState } from '@/components/spool/SpoolChecksPane'

export type RightSidebarPanelSource =
  | { kind: 'local' }
  | {
      kind: 'spool'
      route: SpoolWorkspaceRoute
      supportsGit: boolean
      sessions: readonly SpoolSessionCatalogEntry[]
      catalogStatus: SpoolSessionCatalogPageState['status']
      checksState: SpoolChecksReadState
    }

export const LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE: RightSidebarPanelSource = { kind: 'local' }
