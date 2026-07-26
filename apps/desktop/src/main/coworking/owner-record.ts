import type {
  CoworkingDesktopCatalog,
  CoworkingRemoteDesktop
} from '../../shared/coworking/catalog-contract'
import type { CoworkingRequesterControlView } from '../../shared/coworking/ipc-contract'
import type { CoworkingPeerConnection } from './peer-connection'
import type { CoworkingSubscription } from './peer-connection-contract'
import type { DiscoveredCoworkingDesktop } from './tailnet-peer-directory'

export type CoworkingOwnerRecord = {
  descriptor: DiscoveredCoworkingDesktop
  connection: CoworkingPeerConnection | null
  unsubscribeState: (() => void) | null
  catalogSubscription: CoworkingSubscription | null
  controlSubscriptions: Map<string, CoworkingSubscription>
  requesterSubscriptions: Set<CoworkingSubscription>
  controlStates: Map<string, CoworkingRequesterControlView>
  catalog: CoworkingDesktopCatalog | null
  status: CoworkingRemoteDesktop['connectionStatus']
  connectionEpoch: number
  connectionGeneration: number
  catalogLoadGeneration: number
  catalogLoadIdentity: string | null
  catalogLoadAbort: AbortController | null
  catalogRetryAttempt: number
  catalogRetryTimer: ReturnType<typeof setTimeout> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

export function createCoworkingOwnerRecord(
  descriptor: DiscoveredCoworkingDesktop
): CoworkingOwnerRecord {
  return {
    descriptor,
    connection: null,
    unsubscribeState: null,
    catalogSubscription: null,
    controlSubscriptions: new Map(),
    requesterSubscriptions: new Set(),
    controlStates: new Map(),
    catalog: null,
    status: 'connecting',
    connectionEpoch: 0,
    connectionGeneration: 0,
    catalogLoadGeneration: 0,
    catalogLoadIdentity: null,
    catalogLoadAbort: null,
    catalogRetryAttempt: 0,
    catalogRetryTimer: null,
    reconnectTimer: null
  }
}

export function projectCoworkingRemoteDesktop(
  record: CoworkingOwnerRecord
): CoworkingRemoteDesktop {
  return {
    desktopRef: record.descriptor.desktopRef,
    tailnetNodeId: record.descriptor.tailnetNodeId,
    userDisplayName: record.descriptor.userDisplayName,
    nodeDisplayName: record.descriptor.nodeDisplayName,
    connectionEpoch: record.connectionEpoch,
    connectionStatus: record.status,
    catalog: record.catalog
  }
}

export function coworkingOwnerHasWorktree(
  record: CoworkingOwnerRecord,
  worktreeRef: string
): boolean {
  return Boolean(
    record.catalog?.projects.some((project) =>
      project.worktrees.some((worktree) => worktree.worktreeRef === worktreeRef)
    )
  )
}
