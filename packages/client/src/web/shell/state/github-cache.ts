import { isJsonRecord, readLocalJson, writeLocalJson } from '~renderer/web/storage/local-json'
import type { PRInfo } from '~shared/types'

const GITHUB_CACHE_STORAGE_KEY = 'yiru.web.githubCache.v1'

export const webShellCacheApi = {
  getGitHub: () => Promise.resolve(readStoredGitHubCache()),
  setGitHub: async (args: {
    cache: { pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }
  }): Promise<void> => writeLocalJson(GITHUB_CACHE_STORAGE_KEY, args.cache)
}

function readStoredGitHubCache(): {
  pr: Record<string, { data: PRInfo | null; fetchedAt: number }>
} {
  const value = readLocalJson(GITHUB_CACHE_STORAGE_KEY)
  if (!isJsonRecord(value) || !isJsonRecord(value.pr)) {
    return { pr: {} }
  }
  const pr: Record<string, { data: PRInfo | null; fetchedAt: number }> = {}
  for (const [key, entry] of Object.entries(value.pr)) {
    if (
      !isJsonRecord(entry) ||
      typeof entry.fetchedAt !== 'number' ||
      !Number.isFinite(entry.fetchedAt)
    ) {
      continue
    }
    const data = decodeStoredPRInfo(entry.data)
    if (data !== undefined) {
      pr[key] = { data, fetchedAt: entry.fetchedAt }
    }
  }
  return { pr }
}

function decodeStoredPRInfo(value: unknown): PRInfo | null | undefined {
  if (value === null) {
    return null
  }
  if (
    !isJsonRecord(value) ||
    typeof value.number !== 'number' ||
    !Number.isFinite(value.number) ||
    typeof value.title !== 'string' ||
    !isPRState(value.state) ||
    typeof value.url !== 'string' ||
    !isCheckStatus(value.checksStatus) ||
    typeof value.updatedAt !== 'string' ||
    !isMergeableState(value.mergeable)
  ) {
    return undefined
  }
  return {
    number: value.number,
    title: value.title,
    state: value.state,
    url: value.url,
    checksStatus: value.checksStatus,
    updatedAt: value.updatedAt,
    mergeable: value.mergeable
  }
}

function isPRState(value: unknown): value is PRInfo['state'] {
  return value === 'open' || value === 'closed' || value === 'merged' || value === 'draft'
}

function isCheckStatus(value: unknown): value is PRInfo['checksStatus'] {
  return value === 'pending' || value === 'success' || value === 'failure' || value === 'neutral'
}

function isMergeableState(value: unknown): value is PRInfo['mergeable'] {
  return value === 'MERGEABLE' || value === 'CONFLICTING' || value === 'UNKNOWN'
}
