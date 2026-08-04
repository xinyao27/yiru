export type CoworkingResourceQuotaScope = 'worktree' | 'project' | 'host'
export type CoworkingResourceQuotaTier = 'read' | 'control' | 'host'

export type CoworkingResourceQuota = {
  fileReadMaxBytes: number
  encryptedFrameMaxBytes: number
  maxConnections: number
  maxConnectionsPerSubject: number
}

// Why: read-only grants are sized for interactive inspection. A host-tier peer
// pages up to 32 MiB of one file so an agent can index a repository, while the
// unchanged frame and connection ceilings keep transport memory bounded.
export const COWORKING_RESOURCE_QUOTAS_BY_TIER = {
  read: {
    fileReadMaxBytes: 2 * 1024 * 1024,
    encryptedFrameMaxBytes: 8 * 1024 * 1024,
    maxConnections: 128,
    maxConnectionsPerSubject: 8
  },
  host: {
    fileReadMaxBytes: 32 * 1024 * 1024,
    encryptedFrameMaxBytes: 8 * 1024 * 1024,
    maxConnections: 128,
    maxConnectionsPerSubject: 8
  }
} as const satisfies Record<'read' | 'host', CoworkingResourceQuota>

export function getCoworkingResourceQuota(
  scope: CoworkingResourceQuotaScope,
  tier: CoworkingResourceQuotaTier
): CoworkingResourceQuota {
  // Why: only a grant that is both machine-wide and host-tier receives the
  // expanded budget; legacy control tiers must not acquire host capacity.
  return scope === 'host' && tier === 'host'
    ? COWORKING_RESOURCE_QUOTAS_BY_TIER.host
    : COWORKING_RESOURCE_QUOTAS_BY_TIER.read
}

export const COWORKING_MAX_TERMINAL_SUBSCRIPTIONS_PER_CONNECTION_WORKTREE = 8
export const COWORKING_MAX_STREAM_QUEUED_BYTES =
  COWORKING_RESOURCE_QUOTAS_BY_TIER.read.encryptedFrameMaxBytes
export const COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE = 5_000
// Why: an SSH-backed first page may need to discover and inspect a complete frozen inventory.
export const COWORKING_SESSION_PAGE_REQUEST_TIMEOUT_MS = 5 * 60_000

// Why: coding-agent JSONL routinely exceeds the preview limit, but remote
// inventory must still have a fixed ceiling independent of host file size.
export const COWORKING_SESSION_INVENTORY_STREAM_PROFILE = 'session-inventory'
export const COWORKING_SESSION_INVENTORY_TRANSCRIPT_MAX_BYTES = 128 * 1024 * 1024
export const COWORKING_SESSION_INVENTORY_JSONL_LINE_MAX_BYTES = 16 * 1024 * 1024
