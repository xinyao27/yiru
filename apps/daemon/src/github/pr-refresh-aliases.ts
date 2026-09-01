import type {
  GitHubPRRefreshAlias,
  GitHubPRRefreshCandidate
} from '@yiru/runtime-protocol/workbench/types'

import { prRefreshState, type PRRefreshQueueEntry } from './pr-refresh-state'

export function pruneWorktreePRRefreshAliases(worktreeId: string): void {
  for (const [key, entry] of prRefreshState.queue) {
    for (const [cacheKey, alias] of entry.aliases) {
      if (alias.worktreeId === worktreeId) {
        entry.aliases.delete(cacheKey)
      }
    }
    if (entry.aliases.size === 0) {
      prRefreshState.queue.delete(key)
      prRefreshState.errorBackoff.delete(key)
    } else if (entry.candidate.worktreeId === worktreeId) {
      replaceRepresentativeCandidate(entry, entry.aliases.values().next().value)
    }
  }
}

export function removeQueuedAliasForInvalidCandidate(
  key: string,
  alias: GitHubPRRefreshAlias
): void {
  const existing = prRefreshState.queue.get(key)
  if (!existing) {
    return
  }
  existing.aliases.delete(alias.cacheKey)
  const replacement = existing.aliases.values().next().value
  if (!replacement) {
    prRefreshState.queue.delete(key)
    prRefreshState.errorBackoff.delete(key)
  } else if (existing.candidate.cacheKey === alias.cacheKey) {
    replaceRepresentativeCandidate(existing, replacement)
    existing.candidate.isArchived = false
    existing.candidate.isBare = false
  }
}

function replaceRepresentativeCandidate(
  entry: Pick<PRRefreshQueueEntry, 'candidate'>,
  alias: GitHubPRRefreshAlias | undefined
): void {
  if (alias) {
    entry.candidate = replaceCandidate(entry.candidate, alias)
  }
}

function replaceCandidate(
  candidate: GitHubPRRefreshCandidate,
  alias: GitHubPRRefreshAlias
): GitHubPRRefreshCandidate {
  return {
    ...candidate,
    cacheKey: alias.cacheKey,
    branch: alias.branch,
    worktreeId: alias.worktreeId,
    currentHeadOid: alias.currentHeadOid ?? null
  }
}
