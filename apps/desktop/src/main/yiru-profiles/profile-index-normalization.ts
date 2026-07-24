import {
  YIRU_PROFILE_INDEX_SCHEMA_VERSION,
  type YiruProfileIndex,
  type YiruProfileSummary
} from '../../shared/yiru-profiles'

export type ProfileIndexReadResult = {
  index: YiruProfileIndex
  migratedCloudProfiles: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProfileSummary(value: unknown): value is YiruProfileSummary {
  if (!isObject(value)) {
    return false
  }
  const avatar = value.avatar
  const valid =
    typeof value.id === 'string' &&
    // Why: IDs from the on-disk index become filesystem path segments; a
    // tampered index must not be able to escape the profiles directory.
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.id) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    (value.kind === 'local' || value.kind === 'cloud-linked') &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    typeof value.lastOpenedAt === 'number' &&
    isObject(avatar) &&
    avatar.kind === 'initials' &&
    typeof avatar.initials === 'string' &&
    avatar.color === 'neutral'
  if (!valid) {
    return false
  }
  // Why: cloud accounts were removed, but their profile directories still
  // contain valid local user data and must remain accessible after upgrade.
  value.kind = 'local'
  delete value.cloud
  return true
}

export function normalizeProfileIndex(raw: unknown): ProfileIndexReadResult | null {
  if (!isObject(raw) || !Array.isArray(raw.profiles)) {
    return null
  }
  let migratedCloudProfiles = false
  const profiles = raw.profiles.filter((value): value is YiruProfileSummary => {
    const hadCloudState =
      isObject(value) && (value.kind === 'cloud-linked' || Object.hasOwn(value, 'cloud'))
    const valid = isProfileSummary(value)
    if (valid && hadCloudState) {
      migratedCloudProfiles = true
    }
    return valid
  })
  const activeProfileId =
    typeof raw.activeProfileId === 'string' &&
    profiles.some((profile) => profile.id === raw.activeProfileId)
      ? raw.activeProfileId
      : profiles[0]?.id
  if (!activeProfileId) {
    return null
  }
  return {
    index: {
      schemaVersion: YIRU_PROFILE_INDEX_SCHEMA_VERSION,
      activeProfileId,
      profiles
    },
    migratedCloudProfiles
  }
}
