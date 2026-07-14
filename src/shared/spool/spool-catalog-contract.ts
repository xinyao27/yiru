export const SPOOL_CATALOG_MAX_PROJECTS = 128
export const SPOOL_CATALOG_MAX_WORKTREES = 128
// Why: session history is unbounded across time, so this is a wire-page cap,
// not a completeness cap for a Public worktree.
export const SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE = 512

export type SpoolProviderQuotaWindow = {
  usedPercent: number
  resetsAt: number | null
}

export type SpoolProviderQuota = {
  provider: 'claude' | 'codex'
  status: 'ok' | 'unavailable'
  updatedAt: number | null
  fiveHour: SpoolProviderQuotaWindow | null
  sevenDay: SpoolProviderQuotaWindow | null
}

export type SpoolSessionCatalogEntry = {
  sessionRef: string
  provider: 'claude' | 'codex' | 'other'
  title: string
}

export type SpoolSessionCatalogPageState = {
  status: 'loading' | 'complete' | 'error'
  nextCursor: string | null
}

export type SpoolWorktreeCatalogEntry = {
  worktreeRef: string
  shareEpoch: string
  name: string
  branch: string | null
  sessions: readonly SpoolSessionCatalogEntry[]
  sessionCatalog: SpoolSessionCatalogPageState
}

export type SpoolProjectCatalogEntry = {
  projectRef: string
  name: string
  worktrees: readonly SpoolWorktreeCatalogEntry[]
}

export type SpoolDesktopCatalog = {
  protocolVersion: number
  ownerRuntimeId: string
  catalogRevision: number
  quota: readonly SpoolProviderQuota[]
  projects: readonly SpoolProjectCatalogEntry[]
}

export type SpoolSessionCatalogPage = {
  catalogRevision: number
  worktreeRef: string
  shareEpoch: string
  sessions: readonly SpoolSessionCatalogEntry[]
  sessionCatalog: SpoolSessionCatalogPageState
}

export type SpoolRemoteDesktop = {
  desktopRef: string
  tailnetNodeId: string
  userDisplayName: string
  nodeDisplayName: string
  connectionEpoch: number
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  catalog: SpoolDesktopCatalog | null
}
