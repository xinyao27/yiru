import type {
  SpoolDesktopCatalog,
  SpoolRemoteDesktop
} from '../../shared/spool/spool-catalog-contract'
import type { SpoolRequesterControlView } from '../../shared/spool/spool-ipc-contract'
import type { SpoolPeerConnection } from './spool-peer-connection'
import type { SpoolSubscription } from './spool-peer-connection-contract'
import type { DiscoveredSpoolDesktop } from './tailnet-peer-directory'

export type SpoolDesktopRecord = {
  descriptor: DiscoveredSpoolDesktop
  connection: SpoolPeerConnection | null
  unsubscribeState: (() => void) | null
  catalogSubscription: SpoolSubscription | null
  controlSubscriptions: Map<string, SpoolSubscription>
  requesterSubscriptions: Set<SpoolSubscription>
  controlStates: Map<string, SpoolRequesterControlView>
  catalog: SpoolDesktopCatalog | null
  status: SpoolRemoteDesktop['connectionStatus']
  connectionEpoch: number
  connectionGeneration: number
  catalogLoadGeneration: number
  catalogLoadIdentity: string | null
  catalogLoadAbort: AbortController | null
  catalogRetryAttempt: number
  catalogRetryTimer: ReturnType<typeof setTimeout> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

export function createSpoolDesktopRecord(descriptor: DiscoveredSpoolDesktop): SpoolDesktopRecord {
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

export function projectSpoolRemoteDesktop(record: SpoolDesktopRecord): SpoolRemoteDesktop {
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

export function spoolDesktopHasWorktree(record: SpoolDesktopRecord, worktreeRef: string): boolean {
  return Boolean(
    record.catalog?.projects.some((project) =>
      project.worktrees.some((worktree) => worktree.worktreeRef === worktreeRef)
    )
  )
}
