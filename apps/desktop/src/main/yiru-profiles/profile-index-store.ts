import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { dirname } from 'node:path'

import type { GlobalSettings } from '../../shared/types'
import {
  createDefaultLocalYiruProfile,
  DEFAULT_LOCAL_YIRU_PROFILE_ID,
  DEFAULT_LOCAL_YIRU_PROFILE_NAME,
  YIRU_PROFILE_INDEX_SCHEMA_VERSION,
  type CreateLocalYiruProfileArgs,
  type CreateLocalYiruProfileResult,
  type YiruProfileIndex,
  type YiruProfileListState,
  type YiruProfileSummary
} from '../../shared/yiru-profiles'
import { purgeLegacyCloudProfileFiles } from './legacy-cloud-profile-cleanup'
import { normalizeProfileIndex, type ProfileIndexReadResult } from './profile-index-normalization'
import {
  getYiruProfileBrowserSessionMetaFile,
  getYiruProfileDataFile,
  getYiruProfileDirectory,
  getYiruProfileIndexPath,
  getProfileUserDataPath,
  LEGACY_BACKUP_COUNT,
  legacyBackupPath,
  legacyBrowserSessionMetaPath,
  legacyDataFilePath,
  profileBackupPath
} from './profile-storage-paths'

export {
  getYiruProfileBrowserSessionMetaFile,
  getYiruProfileDataFile,
  getYiruProfileDirectory,
  getYiruProfileIndexPath,
  getYiruProfilesDirectory,
  initYiruProfilePaths
} from './profile-storage-paths'

export type ActiveYiruProfileState = {
  index: YiruProfileIndex
  profile: YiruProfileSummary
  dataFile: string
  profileDirectory: string
}

function sanitizeProfileName(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed.slice(0, 80) : 'New Profile'
}

function readProfileIndexFile(indexPath: string): ProfileIndexReadResult | null {
  try {
    return normalizeProfileIndex(JSON.parse(readFileSync(indexPath, 'utf-8')))
  } catch {
    return null
  }
}

function readProfileIndexResult(indexPath: string): ProfileIndexReadResult | null {
  // Why: a torn/corrupt index must not silently reset the app to a single
  // default profile — that would orphan every other profile's data directory.
  const primary = readProfileIndexFile(indexPath)
  const backup = readProfileIndexFile(`${indexPath}.bak`)
  if (primary) {
    return {
      index: primary.index,
      // Why: a canonical primary can still have an older cloud-bearing backup.
      // Refresh both so recovery cannot resurrect removed account metadata.
      migratedCloudProfiles: primary.migratedCloudProfiles || backup?.migratedCloudProfiles === true
    }
  }
  return backup
}

export function readProfileIndex(indexPath: string): YiruProfileIndex | null {
  return readProfileIndexResult(indexPath)?.index ?? null
}

export function writeProfileIndex(indexPath: string, index: YiruProfileIndex): void {
  mkdirSync(dirname(indexPath), { recursive: true })
  // Why: only a still-parseable current index may refresh the backup;
  // copying a corrupt file over the backup would destroy the recovery copy.
  if (existsSync(indexPath) && readProfileIndexFile(indexPath)) {
    try {
      copyFileSync(indexPath, `${indexPath}.bak`)
    } catch {
      // Best-effort backup; the primary write below still proceeds.
    }
  }
  const tmpPath = `${indexPath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8')
  renameSync(tmpPath, indexPath)
}

function persistCloudProfileMigration(indexPath: string, index: YiruProfileIndex): void {
  try {
    writeProfileIndex(indexPath, index)
    // Why: writeProfileIndex first preserves the old primary as a backup; replace
    // that copy too so removed cloud account metadata cannot be restored later.
    copyFileSync(indexPath, `${indexPath}.bak`)
  } catch {
    // Keep the normalized profile usable in memory. Remaining cloud metadata
    // makes the migration retry on the next startup.
  }
}

function copyIfPresent(source: string, target: string): void {
  if (!existsSync(source) || existsSync(target)) {
    return
  }
  mkdirSync(dirname(target), { recursive: true })
  // Why: tmp+rename so a crash mid-copy cannot leave a truncated target that
  // the exists() guard above would then treat as a completed migration.
  const tmpTarget = `${target}.tmp`
  copyFileSync(source, tmpTarget)
  renameSync(tmpTarget, target)
}

function copyLegacyStateToProfile(userDataPath: string, profileId: string): void {
  const profileDataFile = getYiruProfileDataFile(profileId, userDataPath)
  copyIfPresent(legacyDataFilePath(userDataPath), profileDataFile)
  copyIfPresent(
    legacyBrowserSessionMetaPath(userDataPath),
    getYiruProfileBrowserSessionMetaFile(profileId, userDataPath)
  )
  for (let i = 0; i < LEGACY_BACKUP_COUNT; i++) {
    copyIfPresent(legacyBackupPath(userDataPath, i), profileBackupPath(profileDataFile, i))
  }
}

// Why: a brand-new profile has no data file, which the telemetry cohort
// migration reads as a fresh install and defaults to opted-in. Copying the
// active profile's consent block keeps an opted-out user opted out (and keeps
// one installId per install) when they create additional profiles.
export function seedNewYiruProfileTelemetryConsent(
  profileId: string,
  telemetry: GlobalSettings['telemetry'],
  userDataPath = getProfileUserDataPath()
): void {
  if (!telemetry) {
    return
  }
  const dataFile = getYiruProfileDataFile(profileId, userDataPath)
  if (existsSync(dataFile)) {
    return
  }
  mkdirSync(dirname(dataFile), { recursive: true })
  const tmpPath = `${dataFile}.tmp`
  writeFileSync(tmpPath, JSON.stringify({ settings: { telemetry } }, null, 2), 'utf-8')
  renameSync(tmpPath, dataFile)
}

function createInitialProfileIndex(now = Date.now()): YiruProfileIndex {
  const profile = createDefaultLocalYiruProfile(now)
  return {
    schemaVersion: YIRU_PROFILE_INDEX_SCHEMA_VERSION,
    activeProfileId: profile.id,
    profiles: [profile]
  }
}

export function loadOrCreateProfileIndex(userDataPath: string): YiruProfileIndex {
  const indexPath = getYiruProfileIndexPath(userDataPath)
  const result = readProfileIndexResult(indexPath)
  if (result) {
    purgeLegacyCloudProfileFiles(result.index, userDataPath)
    if (result.migratedCloudProfiles) {
      persistCloudProfileMigration(indexPath, result.index)
    }
    return result.index
  }
  const nextIndex = createInitialProfileIndex()
  writeProfileIndex(indexPath, nextIndex)
  return nextIndex
}

function getActiveProfile(index: YiruProfileIndex): YiruProfileSummary {
  return (
    index.profiles.find((profile) => profile.id === index.activeProfileId) ??
    index.profiles[0] ??
    createDefaultLocalYiruProfile(Date.now())
  )
}

export function ensureActiveYiruProfile(
  userDataPath = getProfileUserDataPath()
): ActiveYiruProfileState {
  const indexPath = getYiruProfileIndexPath(userDataPath)
  const readResult = readProfileIndexResult(indexPath)
  let index = readResult?.index ?? null
  let shouldWriteIndex = readResult?.migratedCloudProfiles ?? false

  if (!index) {
    index = createInitialProfileIndex()
    shouldWriteIndex = true
  }

  const activeProfile = getActiveProfile(index)
  if (activeProfile.id !== index.activeProfileId) {
    index = { ...index, activeProfileId: activeProfile.id }
    shouldWriteIndex = true
  }

  const profileDirectory = getYiruProfileDirectory(activeProfile.id, userDataPath)
  mkdirSync(profileDirectory, { recursive: true })
  if (activeProfile.id === DEFAULT_LOCAL_YIRU_PROFILE_ID) {
    copyLegacyStateToProfile(userDataPath, activeProfile.id)
  }

  purgeLegacyCloudProfileFiles(index, userDataPath)

  if (shouldWriteIndex) {
    if (readResult?.migratedCloudProfiles) {
      persistCloudProfileMigration(indexPath, index)
    } else {
      writeProfileIndex(indexPath, index)
    }
  }

  return {
    index,
    profile: activeProfile,
    dataFile: getYiruProfileDataFile(activeProfile.id, userDataPath),
    profileDirectory
  }
}

export function isDefaultLocalYiruProfileId(profileId: string): boolean {
  return profileId === DEFAULT_LOCAL_YIRU_PROFILE_ID
}

export function getYiruProfileListState(
  userDataPath = getProfileUserDataPath()
): YiruProfileListState {
  const { index } = ensureActiveYiruProfile(userDataPath)
  return {
    activeProfileId: index.activeProfileId,
    profiles: index.profiles
  }
}

export function createLocalYiruProfile(
  args: CreateLocalYiruProfileArgs = {},
  userDataPath = getProfileUserDataPath()
): CreateLocalYiruProfileResult {
  const index = loadOrCreateProfileIndex(userDataPath)
  const now = Date.now()
  const name = sanitizeProfileName(args.name)
  const profile: YiruProfileSummary = {
    id: `local-${randomUUID()}`,
    name,
    avatar: {
      kind: 'initials',
      initials: (
        name.match(/[A-Za-z0-9]/)?.[0] ?? DEFAULT_LOCAL_YIRU_PROFILE_NAME[0]
      ).toUpperCase(),
      color: 'neutral'
    },
    kind: 'local',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  }
  const nextIndex: YiruProfileIndex = {
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

export function setActiveYiruProfile(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): YiruProfileListState {
  const index = loadOrCreateProfileIndex(userDataPath)
  const now = Date.now()
  let found = false
  const profiles = index.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile
    }
    found = true
    return {
      ...profile,
      updatedAt: now,
      lastOpenedAt: now
    }
  })
  if (!found) {
    throw new Error('unknown_yiru_profile')
  }
  const nextIndex: YiruProfileIndex = {
    ...index,
    activeProfileId: profileId,
    profiles
  }
  mkdirSync(getYiruProfileDirectory(profileId, userDataPath), { recursive: true })
  writeProfileIndex(getYiruProfileIndexPath(userDataPath), nextIndex)
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles
  }
}
