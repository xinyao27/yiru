import { join } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

const LEGACY_DATA_FILE_NAME = 'yiru-data.json'
const LEGACY_BROWSER_SESSION_META_FILE_NAME = 'browser-session-meta.json'
const PROFILE_INDEX_FILE_NAME = 'yiru-profile-index.json'
const PROFILE_DATA_FILE_NAME = 'yiru-data.json'
const PROFILE_BROWSER_SESSION_META_FILE_NAME = 'browser-session-meta.json'
const PROFILE_DIRECTORY_NAME = 'profiles'

export const LEGACY_BACKUP_COUNT = 5

let profileUserDataPath: string | null = null

export function initYiruProfilePaths(): void {
  // Why: both browser and daemon hosts install their process-specific
  // provider before profile startup, so profile resolution remains portable.
  profileUserDataPath = getRuntimeHostPathsProvider().userDataPath()
}

export function getProfileUserDataPath(): string {
  if (!profileUserDataPath) {
    profileUserDataPath = getRuntimeHostPathsProvider().userDataPath()
  }
  return profileUserDataPath
}

export function getYiruProfileIndexPath(userDataPath = getProfileUserDataPath()): string {
  return join(userDataPath, PROFILE_INDEX_FILE_NAME)
}

export function getYiruProfilesDirectory(userDataPath = getProfileUserDataPath()): string {
  return join(userDataPath, PROFILE_DIRECTORY_NAME)
}

export function getYiruProfileDirectory(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): string {
  return join(getYiruProfilesDirectory(userDataPath), profileId)
}

export function getYiruProfileDataFile(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): string {
  return join(getYiruProfileDirectory(profileId, userDataPath), PROFILE_DATA_FILE_NAME)
}

export function getYiruProfileBrowserSessionMetaFile(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): string {
  return join(
    getYiruProfileDirectory(profileId, userDataPath),
    PROFILE_BROWSER_SESSION_META_FILE_NAME
  )
}

export function legacyDataFilePath(userDataPath: string): string {
  return join(userDataPath, LEGACY_DATA_FILE_NAME)
}

export function legacyBrowserSessionMetaPath(userDataPath: string): string {
  return join(userDataPath, LEGACY_BROWSER_SESSION_META_FILE_NAME)
}

export function legacyBackupPath(userDataPath: string, index: number): string {
  return `${legacyDataFilePath(userDataPath)}.bak.${index}`
}

export function profileBackupPath(profileDataFile: string, index: number): string {
  return `${profileDataFile}.bak.${index}`
}
