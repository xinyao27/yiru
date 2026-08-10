import type { BrowserSessionProfile } from '~shared/types'
import {
  DEFAULT_LOCAL_YIRU_PROFILE_ID,
  getYiruProfileBrowserPartitionSegment
} from '~shared/yiru-profiles'

import { parseBrowserSessionSource } from './session-metadata'

const LEGACY_BROWSER_SESSION_PARTITION_RE =
  /^persist:yiru-browser-session-[\da-f-]{8}-[\da-f-]{4}-[\da-f-]{4}-[\da-f-]{4}-[\da-f-]{12}$/

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function isOwnedSessionPartition(partition: string, yiruProfileId: string): boolean {
  if (
    yiruProfileId === DEFAULT_LOCAL_YIRU_PROFILE_ID &&
    LEGACY_BROWSER_SESSION_PARTITION_RE.test(partition)
  ) {
    return true
  }
  const segment = getYiruProfileBrowserPartitionSegment(yiruProfileId)
  const prefix = `persist:yiru-profile-${segment}-browser-session-`
  if (!partition.startsWith(prefix)) {
    return false
  }
  return /^[\da-f-]{8}-[\da-f-]{4}-[\da-f-]{4}-[\da-f-]{4}-[\da-f-]{12}$/.test(
    partition.slice(prefix.length)
  )
}

export function parsePersistedBrowserSessionProfile(
  candidate: unknown,
  yiruProfileId: string
): BrowserSessionProfile | null {
  const profile = toRecord(candidate)
  if (
    !profile ||
    typeof profile.id !== 'string' ||
    profile.id === 'default' ||
    (profile.scope !== 'isolated' && profile.scope !== 'imported') ||
    typeof profile.partition !== 'string' ||
    typeof profile.label !== 'string' ||
    !isOwnedSessionPartition(profile.partition, yiruProfileId)
  ) {
    return null
  }
  const source = profile.source === null ? null : parseBrowserSessionSource(profile.source)
  if (profile.source !== null && !source) {
    return null
  }
  return {
    id: profile.id,
    scope: profile.scope,
    partition: profile.partition,
    label: profile.label,
    source
  }
}
