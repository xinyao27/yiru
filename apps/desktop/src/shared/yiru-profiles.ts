import { YIRU_BROWSER_PARTITION } from './constants'
import type { ExecutionHostId } from './execution-host'

export const YIRU_PROFILE_INDEX_SCHEMA_VERSION = 1
export const DEFAULT_LOCAL_YIRU_PROFILE_ID = 'local-default'
export const DEFAULT_LOCAL_YIRU_PROFILE_NAME = 'Personal'
const DEFAULT_PROFILE_BROWSER_SESSION_PARTITION_PREFIX = 'persist:yiru-browser-session-'

export type YiruProfileAvatar = {
  kind: 'initials'
  initials: string
  color: 'neutral'
}

export type YiruProfileKind = 'local' | 'cloud-linked'

export type YiruProfileCloudSummary = {
  cloudProfileId: string
  userId: string
  email: string
  displayName?: string
  activeOrgId?: string
  activeOrgName?: string
  linkedAt: number
}

export type YiruCloudOrgSummary = {
  orgId: string
  name: string
  role?: string
}

export type YiruCloudCapabilityFlags = Record<string, boolean>

export type YiruCloudCapabilities = {
  flags: YiruCloudCapabilityFlags
  refreshedAt: number
}

export type YiruCloudSessionPersistence = 'none' | 'encrypted' | 'memory-only' | 'dev-plaintext'

export type YiruProfileAuthState = 'local' | 'unconfigured' | 'connected' | 'reconnect-required'

export type YiruProfileAuthStatus = {
  activeProfileId: string
  configured: boolean
  state: YiruProfileAuthState
  persistence: YiruCloudSessionPersistence
  cloud?: YiruProfileCloudSummary
  organizations?: YiruCloudOrgSummary[]
  capabilities?: YiruCloudCapabilities
  credentialError?: string
  setupMessage?: string
}

export type YiruProfileSummary = {
  id: string
  name: string
  avatar: YiruProfileAvatar
  kind: YiruProfileKind
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  cloud?: YiruProfileCloudSummary
}

export type YiruProfileIndex = {
  schemaVersion: number
  activeProfileId: string
  profiles: YiruProfileSummary[]
}

export type YiruProfileListState = {
  activeProfileId: string
  profiles: YiruProfileSummary[]
}

export type YiruProfileListResult = YiruProfileListState & {
  // Why: gates the full multi-profile switcher UI; default builds show a
  // single-profile account menu instead.
  multiProfileUi: boolean
}

export type CreateLocalYiruProfileArgs = {
  name?: string
}

export type CreateLocalYiruProfileResult = YiruProfileListState & {
  profile: YiruProfileSummary
}

export type CreateCloudLinkedYiruProfileArgs = {
  orgId?: string
  name?: string
}

export type SwitchYiruProfileArgs = {
  profileId: string
}

export type SwitchYiruProfileResult = {
  status: 'already-active' | 'relaunching'
}

export type TransferYiruProfileProjectMode = 'move' | 'copy'

export type TransferYiruProfileProjectArgs = {
  sourceProfileId: string
  targetProfileId: string
  repoId: string
  mode: TransferYiruProfileProjectMode
}

export type FindYiruProfileProjectsByPathArgs = {
  path: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  excludeProfileId?: string | null
}

export type YiruProfileProjectPresence = {
  profileId: string
  profileName: string
  profileKind: YiruProfileKind
  repoId: string
  repoName: string
}

export type FindYiruProfileProjectsByPathResult = {
  projects: YiruProfileProjectPresence[]
}

export type TransferYiruProfileProjectResult =
  | {
      status: 'transferred'
      mode: TransferYiruProfileProjectMode
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      targetRepoId: string
      targetProjectId: string | null
      willRelaunch?: boolean
    }
  | {
      status: 'duplicate-target'
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      duplicateRepoId: string
    }

export type ConnectCurrentYiruProfileResult =
  | {
      status: 'connected'
      auth: YiruProfileAuthStatus
      activeProfileId: string
      profiles: YiruProfileSummary[]
    }
  | {
      status: 'unconfigured'
      auth: YiruProfileAuthStatus
    }
  | {
      status: 'cancelled'
      auth: YiruProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: YiruProfileAuthStatus
      error: string
    }

export type CreateCloudLinkedYiruProfileResult =
  | {
      status: 'created'
      auth: YiruProfileAuthStatus
      activeProfileId: string
      profiles: YiruProfileSummary[]
      profile: YiruProfileSummary
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: YiruProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: YiruProfileAuthStatus
      error: string
    }

export type SignOutCurrentYiruProfileResult = {
  status: 'signed-out'
  auth: YiruProfileAuthStatus
  activeProfileId: string
  profiles: YiruProfileSummary[]
}

export type SelectYiruProfileOrgArgs = {
  orgId: string
}

export type SelectYiruProfileOrgResult =
  | {
      status: 'selected'
      auth: YiruProfileAuthStatus
      activeProfileId: string
      profiles: YiruProfileSummary[]
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: YiruProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: YiruProfileAuthStatus
      error: string
    }

export type RefreshCurrentYiruProfileAuthResult =
  | {
      status: 'refreshed'
      auth: YiruProfileAuthStatus
      activeProfileId: string
      profiles: YiruProfileSummary[]
    }
  | {
      status: 'local' | 'unconfigured' | 'reconnect-required'
      auth: YiruProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: YiruProfileAuthStatus
      error: string
    }

// Why: organization roles are a fixed server-side enum; the desktop UI mirrors
// exactly these three so role selects can't drift from what the API accepts.
export type YiruOrgRole = 'owner' | 'admin' | 'member'

export type YiruOrgMember = {
  // Why: null for teammates provisioned server-side who never signed into Yiru;
  // mutation actions are disabled for them since the API keys on a real userId.
  userId: string | null
  email: string
  displayName?: string
  role: YiruOrgRole
}

export type YiruOrgPendingInvite = {
  email: string
  role: YiruOrgRole
  createdAt: number
}

export type YiruOrgMembersRoster = {
  members: YiruOrgMember[]
  pendingInvites: YiruOrgPendingInvite[]
  viewerRole: YiruOrgRole
  canManageMembers: boolean
}

export type YiruProfileOrgMembersListArgs = {
  orgId: string
}

export type YiruProfileOrgMemberInviteArgs = {
  orgId: string
  email: string
  role: YiruOrgRole
}

export type YiruProfileOrgInviteRevokeArgs = {
  orgId: string
  email: string
}

export type YiruProfileOrgMemberChangeRoleArgs = {
  orgId: string
  userId: string
  role: YiruOrgRole
}

export type YiruProfileOrgMemberRemoveArgs = {
  orgId: string
  userId: string
}

export type YiruProfileOrgMembersListResult =
  | { status: 'ok'; roster: YiruOrgMembersRoster }
  | { status: 'unconfigured' | 'reconnect-required' }
  | { status: 'failed'; error: string }

export type YiruOrgInviteConflictReason = 'already_member' | 'already_invited'
export type YiruOrgMutationInvalidReason = 'cannot_change_own_role' | 'cannot_remove_self'

export type YiruProfileOrgMemberMutationResult =
  | { status: 'ok' }
  | { status: 'unconfigured' | 'reconnect-required' | 'forbidden' | 'not-found' }
  | { status: 'conflict'; reason: YiruOrgInviteConflictReason }
  | { status: 'invalid'; reason: YiruOrgMutationInvalidReason }
  | { status: 'failed'; error: string }

export function createDefaultLocalYiruProfile(now: number): YiruProfileSummary {
  return {
    id: DEFAULT_LOCAL_YIRU_PROFILE_ID,
    name: DEFAULT_LOCAL_YIRU_PROFILE_NAME,
    avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
    kind: 'local',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  }
}

function profilePartitionHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getYiruProfileBrowserPartitionSegment(profileId: string): string {
  const safe = profileId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || 'profile'
  return `${safe}-${profilePartitionHash(profileId)}`
}

export function getYiruProfileBrowserDefaultPartition(profileId: string): string {
  if (profileId === DEFAULT_LOCAL_YIRU_PROFILE_ID) {
    return YIRU_BROWSER_PARTITION
  }
  return `persist:yiru-profile-${getYiruProfileBrowserPartitionSegment(profileId)}-browser-default`
}

export function getYiruProfileBrowserSessionPartition(
  profileId: string,
  browserSessionProfileId: string
): string {
  if (profileId === DEFAULT_LOCAL_YIRU_PROFILE_ID) {
    return `${DEFAULT_PROFILE_BROWSER_SESSION_PARTITION_PREFIX}${browserSessionProfileId}`
  }
  return `persist:yiru-profile-${getYiruProfileBrowserPartitionSegment(
    profileId
  )}-browser-session-${browserSessionProfileId}`
}
