import { getDefaultWorkspaceSession } from '~shared/constants'
import type { BrowserHistoryEntry, WorkspaceSessionState } from '~shared/types'

import { isJsonRecord } from './storage/local-json'

export function sanitizeWebRuntimeWorkspaceSession(session: unknown): WorkspaceSessionState {
  const defaults = getDefaultWorkspaceSession()
  if (!isJsonRecord(session)) {
    return defaults
  }
  return {
    ...defaults,
    // Why: paired web clients get live tabs from the host runtime. Persisting
    // those remote handles in browser storage replays stale terminal/browser
    // selectors after a new pairing or host restart.
    activeRepoId: readNullableString(session.activeRepoId),
    activeWorktreeId: readNullableString(session.activeWorktreeId),
    browserUrlHistory: readBrowserHistory(session.browserUrlHistory),
    lastVisitedAtByWorktreeId: readTimestampRecord(session.lastVisitedAtByWorktreeId)
  }
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readBrowserHistory(value: unknown): BrowserHistoryEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (
      !isJsonRecord(entry) ||
      typeof entry.url !== 'string' ||
      typeof entry.normalizedUrl !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.lastVisitedAt !== 'number' ||
      !Number.isFinite(entry.lastVisitedAt) ||
      typeof entry.visitCount !== 'number' ||
      !Number.isFinite(entry.visitCount)
    ) {
      return []
    }
    return [
      {
        url: entry.url,
        normalizedUrl: entry.normalizedUrl,
        title: entry.title,
        lastVisitedAt: entry.lastVisitedAt,
        visitCount: entry.visitCount
      }
    ]
  })
}

function readTimestampRecord(value: unknown): Record<string, number> | undefined {
  if (!isJsonRecord(value)) {
    return undefined
  }
  const timestamps: Record<string, number> = {}
  for (const [key, timestamp] of Object.entries(value)) {
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      timestamps[key] = timestamp
    }
  }
  return timestamps
}
