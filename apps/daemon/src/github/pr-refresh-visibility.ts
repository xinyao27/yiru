import type {
  GitHubPRRefreshAlias,
  GitHubPRRefreshCandidate,
  PRRefreshOutcome
} from '@yiru/runtime-protocol/workbench/types'

import {
  bypassesFreshnessDelay,
  freshPRRefreshRetryAt,
  isMergeabilityPendingOutcome,
  visibleCandidateAfterOutcome
} from './pr-refresh-candidate'
import { broadcastPRRefresh, nextPRRefreshQueueOrder } from './pr-refresh-events'
import { clearActiveBurstWindow } from './pr-refresh-pacing'
import { prRefreshState, type PRRefreshQueueEntry } from './pr-refresh-state'

const BACKOFF_BASE_MS = 60000
const BACKOFF_MAX_MS = 15 * 60000

export function isVisiblePRRefreshKey(key: string): boolean {
  const liveWindowIds = prRefreshState.shellAdapter.getLiveRendererIds()
  for (const windowId of prRefreshState.visibleByWindow.keys()) {
    if (!liveWindowIds.has(windowId)) {
      prRefreshState.visibleByWindow.delete(windowId)
    }
  }
  for (const visible of prRefreshState.visibleByWindow.values()) {
    if (visible.keys.has(key)) {
      return true
    }
  }
  return false
}

export function removeInvisibleVisibleRefreshes(): void {
  for (const [key, entry] of prRefreshState.queue) {
    if (entry.reason === 'visible' && !isVisiblePRRefreshKey(key)) {
      prRefreshState.queue.delete(key)
      prRefreshState.errorBackoff.delete(key)
      broadcastPRRefresh({
        aliases: Array.from(entry.aliases.values()),
        reason: 'visible',
        status: 'skipped',
        skippedReason: 'fresh'
      })
    }
  }
}

export function clearVisiblePRRefreshWindow(windowId: number): void {
  const hadVisibleRefreshes = prRefreshState.visibleByWindow.delete(windowId)
  clearActiveBurstWindow(windowId)
  if (hadVisibleRefreshes) {
    removeInvisibleVisibleRefreshes()
  }
}

export function scheduleVisibleFollowUp(
  key: string,
  candidate: GitHubPRRefreshCandidate,
  outcome: PRRefreshOutcome,
  priority: number,
  aliases: GitHubPRRefreshAlias[],
  scheduleDrain: (delay?: number) => void,
  windowId?: number,
  options?: { pendingMergeabilityDelayMs?: number }
): void {
  if (!isVisiblePRRefreshKey(key)) {
    prRefreshState.errorBackoff.delete(key)
    return
  }
  if (outcome.kind === 'upstream-error') {
    const failures = (prRefreshState.errorBackoff.get(key)?.failures ?? 0) + 1
    const retryAt =
      Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(failures - 1, 4))
    prRefreshState.errorBackoff.set(key, { failures, retryAt })
    setVisibleFollowUp({
      key,
      candidate,
      aliases: new Map(aliases.map((alias) => [alias.cacheKey, alias])),
      reason: 'visible',
      priority,
      dueAt: retryAt,
      queuedAt: nextPRRefreshQueueOrder(),
      windowId
    })
    scheduleDrain(retryAt - Date.now())
    return
  }
  prRefreshState.errorBackoff.delete(key)
  const followUpCandidate = visibleCandidateAfterOutcome(candidate, outcome)
  const regularDueAt = freshPRRefreshRetryAt(followUpCandidate) ?? Date.now()
  const pendingDueAt =
    options?.pendingMergeabilityDelayMs !== undefined && isMergeabilityPendingOutcome(outcome)
      ? outcome.fetchedAt + options.pendingMergeabilityDelayMs
      : null
  const dueAt = pendingDueAt === null ? regularDueAt : Math.min(regularDueAt, pendingDueAt)
  setVisibleFollowUp({
    key,
    candidate: followUpCandidate,
    aliases: new Map(aliases.map((alias) => [alias.cacheKey, alias])),
    reason: 'visible',
    priority,
    dueAt,
    queuedAt: nextPRRefreshQueueOrder(),
    bypassBackgroundBudget: pendingDueAt !== null,
    windowId
  })
  scheduleDrain(Math.max(0, dueAt - Date.now()))
}

function setVisibleFollowUp(entry: PRRefreshQueueEntry): void {
  const existing = prRefreshState.queue.get(entry.key)
  if (!existing) {
    prRefreshState.queue.set(entry.key, entry)
    return
  }
  for (const alias of entry.aliases.values()) {
    existing.aliases.set(alias.cacheKey, alias)
  }
  if (
    bypassesFreshnessDelay(existing.reason) ||
    existing.priority > entry.priority ||
    existing.dueAt <= entry.dueAt
  ) {
    return
  }
  prRefreshState.queue.set(entry.key, { ...entry, aliases: existing.aliases })
}
