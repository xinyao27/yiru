import type {
  SpoolControlGrant,
  SpoolControlRequest
} from '../../../../shared/spool/spool-access-contract'
import type { SpoolRemoteDesktop } from '../../../../shared/spool/spool-catalog-contract'

export type SpoolWorkspaceRoute = {
  desktopRef: string
  worktreeRef: string
  sessionRef?: string
  connectionEpoch: number
}

export type SpoolExpandedRefsByDesktop = ReadonlyMap<string, ReadonlySet<string>>

export type SpoolControlGrantBinding = {
  desktopRef: string
  worktreeRef: string
  connectionEpoch: number
  grant: SpoolControlGrant
}

export type SpoolSharingState = {
  spoolRemoteDesktops: readonly SpoolRemoteDesktop[]
  spoolExpandedDesktopRefs: ReadonlySet<string>
  spoolExpandedProjectRefsByDesktop: SpoolExpandedRefsByDesktop
  spoolExpandedWorktreeRefsByDesktop: SpoolExpandedRefsByDesktop
  activeSpoolWorkspaceRoute: SpoolWorkspaceRoute | null
  spoolControlRequestQueue: readonly SpoolControlRequest[]
  spoolControlGrantsByWorktree: ReadonlyMap<string, SpoolControlGrantBinding>
}

export type SpoolSharingActions = {
  setSpoolRemoteDesktops: (desktops: readonly SpoolRemoteDesktop[]) => void
  setSpoolDesktopExpanded: (desktopRef: string, expanded: boolean) => void
  setSpoolProjectExpanded: (desktopRef: string, projectRef: string, expanded: boolean) => void
  setSpoolWorktreeExpanded: (desktopRef: string, worktreeRef: string, expanded: boolean) => void
  setActiveSpoolWorkspaceRoute: (route: SpoolWorkspaceRoute | null) => void
  enqueueSpoolControlRequest: (request: SpoolControlRequest) => void
  removeSpoolControlRequest: (requestId: string) => void
  setSpoolControlGrant: (binding: SpoolControlGrantBinding) => void
  removeSpoolControlGrant: (grantId: string) => void
  clearSpoolConnectionAuthority: (desktopRef: string, connectionEpoch?: number) => void
  resetSpoolSharing: () => void
}

export type SpoolSharingSlice = SpoolSharingState & SpoolSharingActions
