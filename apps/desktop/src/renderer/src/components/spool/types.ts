import type { SpoolRemoteDesktop } from '../../../../shared/spool/spool-catalog-contract'
import type {
  SpoolOwnerControlGrantView,
  SpoolOwnerControlRequestView,
  SpoolOwnerWorktreeSharing,
  SpoolRequesterControlView,
  SpoolSharingSnapshot
} from '../../../../shared/spool/spool-ipc-contract'

export type SpoolWorkspaceRoute = {
  desktopRef: string
  worktreeRef: string
  sessionRef?: string
  connectionEpoch: number
}

export type SpoolExpandedRefsByDesktop = ReadonlyMap<string, ReadonlySet<string>>

export type SpoolSharingState = {
  spoolSharingStatus: SpoolSharingSnapshot['status']
  spoolSharingDiagnostic: string | null
  spoolRemoteDesktops: readonly SpoolRemoteDesktop[]
  spoolOwnerWorktrees: readonly SpoolOwnerWorktreeSharing[]
  spoolOwnerControlGrants: readonly SpoolOwnerControlGrantView[]
  spoolExpandedWorktreeRefsByDesktop: SpoolExpandedRefsByDesktop
  activeSpoolWorkspaceRoute: SpoolWorkspaceRoute | null
  spoolControlRequestQueue: readonly SpoolOwnerControlRequestView[]
  spoolRequesterControlByWorktree: ReadonlyMap<string, SpoolRequesterControlView>
}

export type SpoolSharingActions = {
  applySpoolSharingSnapshot: (snapshot: SpoolSharingSnapshot) => void
  setSpoolRemoteDesktops: (desktops: readonly SpoolRemoteDesktop[]) => void
  setSpoolWorktreeExpanded: (desktopRef: string, worktreeRef: string, expanded: boolean) => void
  setActiveSpoolWorkspaceRoute: (route: SpoolWorkspaceRoute | null) => void
  enqueueSpoolControlRequest: (request: SpoolOwnerControlRequestView) => void
  removeSpoolControlRequest: (requestId: string) => void
  markSpoolControlPending: (route: SpoolWorkspaceRoute) => void
  clearSpoolConnectionAuthority: (desktopRef: string, connectionEpoch?: number) => void
  resetSpoolSharing: () => void
}

export type SpoolSharingSlice = SpoolSharingState & SpoolSharingActions
