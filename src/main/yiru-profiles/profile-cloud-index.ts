import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type {
  YiruProfileCloudSummary,
  YiruProfileListState,
  YiruProfileSummary
} from '../../shared/yiru-profiles'
import {
  getYiruProfileDirectory,
  getYiruProfileIndexPath,
  loadOrCreateProfileIndex,
  writeProfileIndex
} from './profile-index-store'

export type CreateCloudLinkedYiruProfileRecordResult = YiruProfileListState & {
  profile: YiruProfileSummary
}

function sanitizeProfileName(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return (trimmed || fallback).slice(0, 80)
}

function profileInitial(name: string): string {
  return (name.match(/[A-Za-z0-9]/)?.[0] ?? 'C').toUpperCase()
}

function toCloudLinkedProfile(
  profile: YiruProfileSummary,
  cloud: YiruProfileCloudSummary,
  now: number
): YiruProfileSummary {
  return {
    ...profile,
    kind: 'cloud-linked',
    cloud,
    updatedAt: now,
    lastOpenedAt: now
  }
}

function toLocalProfile(profile: YiruProfileSummary, now: number): YiruProfileSummary {
  const { cloud: _cloud, ...localProfile } = profile
  return {
    ...localProfile,
    kind: 'local',
    updatedAt: now,
    lastOpenedAt: now
  }
}

export function createCloudLinkedYiruProfileRecord(
  cloud: YiruProfileCloudSummary,
  args: { name?: string },
  userDataPath: string
): CreateCloudLinkedYiruProfileRecordResult {
  const index = loadOrCreateProfileIndex(userDataPath)
  const now = Date.now()
  const fallbackName = cloud.activeOrgName ?? cloud.displayName ?? cloud.email
  const name = sanitizeProfileName(args.name, fallbackName)
  const profile: YiruProfileSummary = {
    id: `cloud-${randomUUID()}`,
    name,
    avatar: {
      kind: 'initials',
      initials: profileInitial(name),
      color: 'neutral'
    },
    kind: 'cloud-linked',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    cloud
  }
  const nextIndex = {
    ...index,
    profiles: [...index.profiles, profile]
  }
  mkdirSync(getYiruProfileDirectory(profile.id, userDataPath), { recursive: true })
  writeProfileIndex(getYiruProfileIndexPath(userDataPath), nextIndex)
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles,
    profile
  }
}

export function linkYiruProfileToCloud(
  profileId: string,
  cloud: YiruProfileCloudSummary,
  userDataPath: string
): YiruProfileListState {
  const index = loadOrCreateProfileIndex(userDataPath)
  const now = Date.now()
  let found = false
  const profiles = index.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile
    }
    found = true
    return toCloudLinkedProfile(profile, cloud, now)
  })
  if (!found) {
    throw new Error('unknown_yiru_profile')
  }
  const nextIndex = {
    ...index,
    profiles
  }
  writeProfileIndex(getYiruProfileIndexPath(userDataPath), nextIndex)
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles
  }
}

export function unlinkYiruProfileFromCloud(
  profileId: string,
  userDataPath: string
): YiruProfileListState {
  const index = loadOrCreateProfileIndex(userDataPath)
  const now = Date.now()
  let found = false
  const profiles = index.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile
    }
    found = true
    return toLocalProfile(profile, now)
  })
  if (!found) {
    throw new Error('unknown_yiru_profile')
  }
  const nextIndex = {
    ...index,
    profiles
  }
  writeProfileIndex(getYiruProfileIndexPath(userDataPath), nextIndex)
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles
  }
}
