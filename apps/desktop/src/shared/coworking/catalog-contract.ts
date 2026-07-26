import type { CoworkingAgentLaunchId } from './agent-launch-contract'
import type { CoworkingWorktreeKind } from './worktree-kind'

export const COWORKING_CATALOG_MAX_PROJECTS = 128
export const COWORKING_CATALOG_MAX_WORKTREES = 128
// Why: session history is unbounded across time, so this is a wire-page cap,
// not a completeness cap for a Public worktree.
export const COWORKING_CATALOG_MAX_SESSIONS_PER_WORKTREE = 512

export function isCoworkingProjectIdentityKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return false
  }
  if (!value.startsWith('github:') && !value.startsWith('git:')) {
    return false
  }
  return !Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

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

export type CoworkingSessionCatalogIdentity =
  | { kind: 'terminal'; agent: null }
  | {
      kind: 'agent'
      /** Null retains an observed custom agent without widening the wire agent enum. */
      agent: CoworkingAgentLaunchId | null
    }

export type CoworkingSessionCatalogEntry = {
  sessionRef: string
  title: string
} & CoworkingSessionCatalogIdentity

export type CoworkingSessionCatalogPageState = {
  status: 'loading' | 'complete' | 'error'
  nextCursor: string | null
}

export type CoworkingWorktreeCatalogEntry = {
  kind: CoworkingWorktreeKind
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

export type CoworkingSessionCatalogPage = {
  catalogRevision: number
  worktreeRef: string
  shareEpoch: string
  sessions: readonly CoworkingSessionCatalogEntry[]
  sessionCatalog: CoworkingSessionCatalogPageState
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
