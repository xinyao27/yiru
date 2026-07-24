import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import { YIRU_BROWSER_PARTITION } from './constants'

export const YIRU_PROFILE_INDEX_SCHEMA_VERSION = 1
export const DEFAULT_LOCAL_YIRU_PROFILE_ID = 'local-default'
export const DEFAULT_LOCAL_YIRU_PROFILE_NAME = 'Personal'
const DEFAULT_PROFILE_BROWSER_SESSION_PARTITION_PREFIX = 'persist:yiru-browser-session-'

export type YiruProfileAvatar = {
  kind: 'initials'
  initials: string
  color: 'neutral'
}

export type YiruProfileKind = 'local'

export type YiruProfileSummary = {
  id: string
  name: string
  avatar: YiruProfileAvatar
  kind: YiruProfileKind
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
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
