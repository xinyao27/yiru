import type { CoworkingRemoteDesktop } from '../../../../shared/coworking/catalog-contract'
import type {
  CoworkingOwnerControlGrantView,
  CoworkingOwnerControlRequestView,
  CoworkingOwnerWorktreeSharing,
  CoworkingRequesterControlView,
  CoworkingSharingSnapshot
} from '../../../../shared/coworking/ipc-contract'

export type CoworkingWorkspaceRoute = {
  desktopRef: string
  worktreeRef: string
  sessionRef?: string
  connectionEpoch: number
}

export type CoworkingExpandedRefsByDesktop = ReadonlyMap<string, ReadonlySet<string>>

export type CoworkingSharingState = {
  coworkingSharingStatus: CoworkingSharingSnapshot['status']
  coworkingSharingDiagnostic: string | null
  coworkingRemoteDesktops: readonly CoworkingRemoteDesktop[]
  coworkingOwnerWorktrees: readonly CoworkingOwnerWorktreeSharing[]
  coworkingOwnerControlGrants: readonly CoworkingOwnerControlGrantView[]
  coworkingExpandedWorktreeRefsByDesktop: CoworkingExpandedRefsByDesktop
  activeCoworkingWorkspaceRoute: CoworkingWorkspaceRoute | null
  coworkingControlRequestQueue: readonly CoworkingOwnerControlRequestView[]
  coworkingRequesterControlByWorktree: ReadonlyMap<string, CoworkingRequesterControlView>
}

export type CoworkingSharingActions = {
  applyCoworkingSharingSnapshot: (snapshot: CoworkingSharingSnapshot) => void
  setCoworkingRemoteDesktops: (desktops: readonly CoworkingRemoteDesktop[]) => void
  setCoworkingWorktreeExpanded: (desktopRef: string, worktreeRef: string, expanded: boolean) => void
  setActiveCoworkingWorkspaceRoute: (route: CoworkingWorkspaceRoute | null) => void
  enqueueCoworkingControlRequest: (request: CoworkingOwnerControlRequestView) => void
  removeCoworkingControlRequest: (requestId: string) => void
  markCoworkingControlPending: (route: CoworkingWorkspaceRoute) => void
  clearCoworkingConnectionAuthority: (desktopRef: string, connectionEpoch?: number) => void
  resetCoworkingSharing: () => void
}

export type CoworkingSharingSlice = CoworkingSharingState & CoworkingSharingActions
