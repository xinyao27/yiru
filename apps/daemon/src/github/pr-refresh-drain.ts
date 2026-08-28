import type {
  GitHubPRRefreshCandidate,
  PRRefreshOutcome
} from '@yiru/runtime-protocol/workbench/types'

import { getPRForBranchOutcome } from './client'
import { hostedReviewOptionArgs, validatePRRefreshCandidate } from './pr-refresh-candidate'
import {
  broadcastPRRefresh,
  nextPRRefreshSequence,
  recordPRRefreshQueueDiagnostic
} from './pr-refresh-events'
import {
  backgroundRefreshBuckets,
  isActiveBurstDelayed,
  isBackgroundPRRefresh,
  isBudgetedQueueEntry,
  nextBackgroundBudgetDelay,
  nextQueuedWakeDelay,
  noteActiveStart,
  noteBackgroundStart,
  prRefreshEntryDelay,
  queuedEntriesByPriority
} from './pr-refresh-pacing'
import { prRefreshState, type PRRefreshQueueEntry } from './pr-refresh-state'
import { isVisiblePRRefreshKey, scheduleVisibleFollowUp } from './pr-refresh-visibility'
import { getRateLimit, noteRateLimitSpend, rateLimitGuard } from './rate-limit'

export async function drainPRRefreshQueue(scheduleDrain: (delay?: number) => void): Promise<void> {
  if (prRefreshState.draining) {
    return
  }
  prRefreshState.draining = true
  try {
    while (prRefreshState.queue.size > 0) {
      let next = queuedEntriesByPriority()[0]
      const waitMs = next.dueAt - Date.now()
      if (waitMs > 0) {
        scheduleDrain(waitMs)
        return
      }
      let delay = prRefreshEntryDelay(next)
      if (delay > 0) {
        const runnable = queuedEntriesByPriority().find(
          (entry) => entry.dueAt <= Date.now() && prRefreshEntryDelay(entry) === 0
        )
        if (runnable && runnable.key !== next.key) {
          next = runnable
          delay = 0
        } else {
          notifyDelayedEntry(next)
          scheduleDrain(Math.min(delay, nextQueuedWakeDelay(next.key) ?? delay))
          return
        }
      }

      prRefreshState.queue.delete(next.key)
      const aliases = Array.from(next.aliases.values())
      const skippedReason = validatePRRefreshCandidate(next.candidate)
      if (skippedReason) {
        prRefreshState.diagnostics.skipped++
        recordPRRefreshQueueDiagnostic('skipped', next.reason, skippedReason)
        broadcastPRRefresh({ aliases, reason: next.reason, status: 'skipped', skippedReason })
        continue
      }
      if (next.reason === 'visible' && !isVisiblePRRefreshKey(next.key)) {
        prRefreshState.errorBackoff.delete(next.key)
        broadcastPRRefresh({
          aliases,
          reason: next.reason,
          status: 'skipped',
          skippedReason: 'fresh'
        })
        continue
      }
      const requestSequence = nextPRRefreshSequence()
      const requestStartedAt = Date.now()
      broadcastPRRefresh(
        { aliases, reason: next.reason, status: 'in-flight', requestStartedAt },
        requestSequence
      )
      if (isBackgroundPRRefresh(next.reason)) {
        const retryAt = await prepareBackgroundRefresh(next)
        if (retryAt !== null) {
          prRefreshState.queue.set(next.key, { ...next, dueAt: retryAt })
          broadcastPRRefresh({
            aliases,
            reason: next.reason,
            status: 'paused',
            pausedUntil: retryAt,
            skippedReason: 'rate-limit'
          })
          scheduleDrain(Math.max(1000, retryAt - Date.now()))
          continue
        }
      }
      const outcome = await lookupPRForRefreshCandidate(next.candidate)
      prRefreshState.outcomeObserver?.(next.candidate, outcome)
      broadcastPRRefresh(
        { aliases, reason: next.reason, outcome, requestStartedAt },
        requestSequence
      )
      scheduleVisibleFollowUp(
        next.key,
        next.candidate,
        outcome,
        next.priority,
        aliases,
        scheduleDrain,
        next.windowId
      )
    }
  } finally {
    prRefreshState.draining = false
  }
}

export function lookupPRForRefreshCandidate(
  candidate: GitHubPRRefreshCandidate
): Promise<PRRefreshOutcome> {
  return getPRForBranchOutcome(
    candidate.repoPath,
    candidate.branch,
    candidate.linkedPRNumber ?? null,
    null,
    candidate.linkedPRNumber == null ? (candidate.fallbackPRNumber ?? null) : null,
    ...hostedReviewOptionArgs(candidate)
  )
}

async function prepareBackgroundRefresh(entry: PRRefreshQueueEntry): Promise<number | null> {
  await getRateLimit()
  const buckets = backgroundRefreshBuckets()
  const blocked = buckets.map(rateLimitGuard).find((guard) => guard.blocked)
  if (blocked?.blocked) {
    return blocked.resetAt * 1000
  }
  if (isBudgetedQueueEntry(entry)) {
    noteBackgroundStart()
  }
  if (entry.reason === 'active') {
    noteActiveStart(entry)
  }
  for (const bucket of buckets) {
    noteRateLimitSpend(bucket)
  }
  return null
}

function notifyDelayedEntry(entry: PRRefreshQueueEntry): void {
  if (isActiveBurstDelayed(entry) && !entry.activeDelayNotified) {
    entry.activeDelayNotified = true
    broadcastPRRefresh({
      aliases: Array.from(entry.aliases.values()),
      reason: entry.reason,
      status: 'queued'
    })
  }
  if (isBudgetedQueueEntry(entry) && nextBackgroundBudgetDelay() > 0) {
    prRefreshState.diagnostics.backgroundPauses++
    recordPRRefreshQueueDiagnostic('background-pause', entry.reason)
  }
}
