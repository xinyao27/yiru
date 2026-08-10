export const COWORKING_REQUESTER_INVOKE_METHODS = [
  'files.list',
  'files.read',
  'files.diff',
  'files.write',
  'files.mkdir',
  'files.rename',
  'files.delete',
  'git.status',
  'git.diff',
  'git.history',
  'git.stage',
  'git.unstage',
  'git.commit',
  'checks.read',
  'session.continue',
  'terminal.launchOptions',
  'terminal.create',
  'terminal.input',
  'terminal.resize'
] as const

export const COWORKING_REQUESTER_SUBSCRIPTION_METHODS = ['terminal.subscribe'] as const

export type CoworkingRequesterInvokeMethod = (typeof COWORKING_REQUESTER_INVOKE_METHODS)[number]
export type CoworkingRequesterSubscriptionMethod =
  (typeof COWORKING_REQUESTER_SUBSCRIPTION_METHODS)[number]

export type CoworkingRequesterInvokeArgs = {
  desktopRef: string
  connectionEpoch: number
  method: CoworkingRequesterInvokeMethod
  params: Record<string, unknown>
}

export type CoworkingRequesterSubscriptionArgs = {
  subscriptionId: string
  desktopRef: string
  connectionEpoch: number
  method: CoworkingRequesterSubscriptionMethod
  params: Record<string, unknown>
}

export type CoworkingRequesterTransportErrorCode =
  | 'disconnected'
  | 'protocol_error'
  | 'timeout'
  | 'invalid_argument'
  | 'method_not_found'
  | 'outcome_unknown'
  | 'resource_busy'
  | 'resource_not_found'
  | 'resource_unavailable'
  | 'result_too_large'
  | 'unauthorized'
  | 'internal_error'

export type CoworkingRequesterSubscriptionEvent =
  | { subscriptionId: string; type: 'next'; value: unknown }
  | { subscriptionId: string; type: 'error'; code: CoworkingRequesterTransportErrorCode }
  | { subscriptionId: string; type: 'complete' }

export type CoworkingProviderQuotaWindow = {
  usedPercent: number
  resetsAt: number | null
}

export type CoworkingProviderQuota = {
  provider: 'claude' | 'codex'
  status: 'ok' | 'unavailable'
  updatedAt: number | null
  fiveHour: CoworkingProviderQuotaWindow | null
  sevenDay: CoworkingProviderQuotaWindow | null
}

export type CoworkingSessionCatalogEntry = {
  sessionRef: string
  title: string
} & (
  | { kind: 'terminal'; agent: null }
  | {
      kind: 'agent'
      agent: CoworkingAgentLaunchId | null
    }
)

export type CoworkingSessionCatalogPageState = {
  status: 'loading' | 'complete' | 'error'
  nextCursor: string | null
}

export type CoworkingWorktreeCatalogEntry = {
  kind: 'git' | 'folder'
  worktreeRef: string
  shareEpoch: string
  name: string
  branch: string | null
  sessions: readonly CoworkingSessionCatalogEntry[]
  sessionCatalog: CoworkingSessionCatalogPageState
}

export type CoworkingProjectCatalogEntry = {
  projectRef: string
  name: string
  worktrees: readonly CoworkingWorktreeCatalogEntry[]
}

export type CoworkingDesktopCatalog = {
  protocolVersion: number
  ownerRuntimeId: string
  catalogRevision: number
  quota: readonly CoworkingProviderQuota[]
  projects: readonly CoworkingProjectCatalogEntry[]
}

export type CoworkingRemoteDesktop = {
  desktopRef: string
  tailnetNodeId: string
  userDisplayName: string
  nodeDisplayName: string
  connectionEpoch: number
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  catalog: CoworkingDesktopCatalog | null
}

export type CoworkingTailnetPrincipal = {
  nodeId: string
  sourceAddress: string
  userDisplayName: string
  nodeDisplayName: string
}

export type CoworkingHostDeviceView = {
  deviceId: string
  name: string
  pairedAt: number
  lastSeenAt: number | null
  subject: { nodeId: string; userDisplayName: string }
  tier: 'read' | 'control' | 'host'
  expiresAt: number | null
  revokedAt: number | null
}

export type CoworkingSharingSnapshot = {
  status: 'starting' | 'ready' | 'unavailable'
  diagnostic: string | null
  self: { nodeDisplayName: string; userDisplayName: string } | null
  remoteDesktops: readonly CoworkingRemoteDesktop[]
  ownerWorktrees: readonly {
    worktreeId: string
    projectId: string | null
    displayName: string
    visibility: 'public' | 'private'
    publicationStatus: 'pending-validation' | 'private' | 'published' | 'suspended'
    shareEpoch: string | null
    suspensionReason?: 'host-unavailable' | 'incarnation-unavailable' | 'overlapping-root'
  }[]
  ownerControlRequests: readonly {
    requestId: string
    requester: CoworkingTailnetPrincipal
    worktreeId: string
    projectDisplayName: string
    worktreeDisplayName: string
    requestedAt: number
  }[]
  ownerHostAccessRequests: readonly {
    requestId: string
    requester: CoworkingTailnetPrincipal
    requestedAt: number
  }[]
  ownerControlGrants: readonly {
    grantId: string
    requester: CoworkingTailnetPrincipal
    worktreeId: string
    worktreeDisplayName: string
    approvedAt: number
  }[]
  ownerActiveConnections: readonly {
    connectionId: string
    requester: CoworkingTailnetPrincipal
    hasControl: boolean
  }[]
  requesterControlStates: readonly {
    desktopRef: string
    worktreeRef: string
    connectionEpoch: number
    status: 'read-only' | 'pending' | 'granted'
    approvedAt?: number
  }[]
}

export type CoworkingSetVisibilityArgs = {
  id: string
  visibility: 'public' | 'private'
}

export type CoworkingControlDecisionArgs = {
  requestId: string
  decision: 'allow' | 'deny'
}

export type CoworkingHostAccessDecisionArgs =
  | { requestId: string; decision: 'deny' }
  | { requestId: string; decision: 'allow'; name: string; tier: 'read' | 'host' }

export type CoworkingRequestHostAccessResult =
  | { status: 'denied' | 'cancelled' }
  | { status: 'granted'; environmentId: string }

export type CoworkingWindowsFirewallStatus =
  | { supported: false }
  | { supported: true; port: number; ruleAllowed: boolean; inspectionAvailable: boolean }

export type CoworkingWindowsFirewallRepairResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unsupported' }
import type { CoworkingAgentLaunchId } from './coworking-input.js'
