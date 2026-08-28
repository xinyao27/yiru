import type {
  GitHubPRRefreshCandidate,
  GitHubPRRefreshReason,
  PRRefreshOutcome
} from '@yiru/runtime-protocol/workbench/types'

import { removeQueuedAliasForInvalidCandidate } from './pr-refresh-aliases'
import {
  bypassesFreshnessDelay,
  freshPRRefreshRetryAt,
  isManualPRRefresh,
  MANUAL_MERGEABILITY_PENDING_REFRESH_MS,
  POST_PUSH_REFRESH_DELAY_MS,
  prRefreshAlias,
  prRefreshKey,
  shouldBroadcastQueuedPRRefresh,
  shouldSkipFreshPRRefresh,
  validatePRRefreshCandidate
} from './pr-refresh-candidate'
import { drainPRRefreshQueue, lookupPRForRefreshCandidate } from './pr-refresh-drain'
import {
  broadcastPRRefresh,
  nextPRRefreshQueueOrder,
  nextPRRefreshSequence,
  recordPRRefreshQueueDiagnostic
} from './pr-refresh-events'
import {
  prRefreshState,
  type PRRefreshOutcomeObserver,
  type PRRefreshShellAdapter
} from './pr-refresh-state'
import { removeInvisibleVisibleRefreshes, scheduleVisibleFollowUp } from './pr-refresh-visibility'

export { pruneWorktreePRRefreshAliases } from './pr-refresh-aliases'
export type { PRRefreshShellAdapter } from './pr-refresh-state'
export { clearVisiblePRRefreshWindow } from './pr-refresh-visibility'

export function setPRRefreshOutcomeObserver(observer: PRRefreshOutcomeObserver | null): void {
  prRefreshState.outcomeObserver = observer
}

export function setPRRefreshShellAdapter(adapter: PRRefreshShellAdapter): void {
  prRefreshState.shellAdapter = adapter
}

export function enqueuePRRefresh(
  candidate: GitHubPRRefreshCandidate,
  reason: GitHubPRRefreshReason,
  priority = 0,
  windowId?: number
): void {
  const alias = prRefreshAlias(candidate)
  const key = prRefreshKey(candidate)
  const skippedReason = validatePRRefreshCandidate(candidate)
  if (skippedReason) {
    removeQueuedAliasForInvalidCandidate(key, alias)
    prRefreshState.diagnostics.skipped++
    recordPRRefreshQueueDiagnostic('skipped', reason, skippedReason)
    broadcastPRRefresh({ aliases: [alias], reason, status: 'skipped', skippedReason })
    return
  }

  const existing = prRefreshState.queue.get(key)
  const freshDueAt = shouldSkipFreshPRRefresh(candidate, reason)
    ? freshPRRefreshRetryAt(candidate)
    : null
  const dueAt = freshDueAt ?? Date.now() + (reason === 'post-push' ? POST_PUSH_REFRESH_DELAY_MS : 0)
  if (existing) {
    existing.aliases.set(alias.cacheKey, alias)
    prRefreshState.diagnostics.coalesced++
    recordPRRefreshQueueDiagnostic('coalesced', reason)
    const shouldPromote =
      priority > existing.priority ||
      isManualPRRefresh(reason) ||
      (reason === 'active' && existing.reason === 'active') ||
      (priority >= existing.priority && dueAt < existing.dueAt && bypassesFreshnessDelay(reason))
    if (shouldPromote) {
      existing.priority = priority
      existing.reason = reason
      existing.dueAt = Math.min(existing.dueAt, dueAt)
      existing.queuedAt = nextPRRefreshQueueOrder()
      existing.activeDelayNotified = false
      existing.candidate = candidate
      existing.windowId = windowId ?? existing.windowId
    } else if (existing.candidate.worktreeId === candidate.worktreeId) {
      existing.candidate = {
        ...existing.candidate,
        cacheKey: candidate.cacheKey,
        branch: candidate.branch,
        currentHeadOid: candidate.currentHeadOid ?? null
      }
    }
  } else {
    prRefreshState.diagnostics.enqueued++
    recordPRRefreshQueueDiagnostic('enqueued', reason)
    prRefreshState.queue.set(key, {
      key,
      candidate,
      aliases: new Map([[alias.cacheKey, alias]]),
      reason,
      priority,
      dueAt,
      queuedAt: nextPRRefreshQueueOrder(),
      windowId
    })
  }
  if (shouldBroadcastQueuedPRRefresh(reason, dueAt)) {
    broadcastPRRefresh({ aliases: [alias], reason, status: 'queued' })
  }
  scheduleDrain()
}

export function reportVisiblePRRefreshCandidates(
  candidates: GitHubPRRefreshCandidate[],
  generation: number,
  windowId: number
): void {
  const existing = prRefreshState.visibleByWindow.get(windowId)
  if (existing && generation < existing.generation) {
    return
  }
  prRefreshState.visibleByWindow.set(windowId, {
    generation,
    keys: new Set(candidates.map(prRefreshKey))
  })
  removeInvisibleVisibleRefreshes()
  for (const candidate of candidates) {
    enqueuePRRefresh(candidate, 'visible', 40, windowId)
  }
}

export async function refreshPRNow(candidate: GitHubPRRefreshCandidate): Promise<PRRefreshOutcome> {
  const alias = prRefreshAlias(candidate)
  const key = prRefreshKey(candidate)
  const existing = prRefreshState.queue.get(key)
  const aliasMap = new Map(existing ? existing.aliases : [])
  aliasMap.set(alias.cacheKey, alias)
  const aliases = Array.from(aliasMap.values())
  const skippedReason = validatePRRefreshCandidate(candidate)
  if (skippedReason) {
    removeQueuedAliasForInvalidCandidate(key, alias)
    const outcome: PRRefreshOutcome = {
      kind: 'upstream-error',
      errorType: 'unknown',
      message: `Cannot refresh PR for this worktree: ${skippedReason}`,
      fetchedAt: Date.now()
    }
    broadcastPRRefresh({ aliases: [alias], reason: 'manual', status: 'skipped', skippedReason })
    return outcome
  }
  prRefreshState.queue.delete(key)
  const requestSequence = nextPRRefreshSequence()
  const requestStartedAt = Date.now()
  broadcastPRRefresh(
    { aliases, reason: 'manual', status: 'in-flight', requestStartedAt },
    requestSequence
  )
  const outcome = await lookupPRForRefreshCandidate(candidate)
  prRefreshState.outcomeObserver?.(candidate, outcome)
  broadcastPRRefresh({ aliases, reason: 'manual', outcome, requestStartedAt }, requestSequence)
  scheduleVisibleFollowUp(key, candidate, outcome, 40, aliases, scheduleDrain, undefined, {
    pendingMergeabilityDelayMs: MANUAL_MERGEABILITY_PENDING_REFRESH_MS
  })
  return outcome
}

function scheduleDrain(delay = 0): void {
  if (prRefreshState.drainTimer) {
    clearTimeout(prRefreshState.drainTimer)
  }
  prRefreshState.drainTimer = setTimeout(() => {
    prRefreshState.drainTimer = null
    void drainPRRefreshQueue(scheduleDrain)
  }, delay)
}
