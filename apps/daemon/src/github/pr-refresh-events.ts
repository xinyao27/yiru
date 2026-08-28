import type {
  GitHubPRRefreshEvent,
  GitHubPRRefreshReason,
  GitHubPRRefreshSkippedReason
} from '@yiru/runtime-protocol/workbench/types'
import { publishGitHubEvent } from '~main/runtime/github-events'

import { recordCoalescedCrashBreadcrumb } from '../crash-reporting/crash-breadcrumb-store'
import { prRefreshState } from './pr-refresh-state'

const DIAGNOSTIC_BREADCRUMB_MIN_INTERVAL_MS = 30000

export function nextPRRefreshSequence(): number {
  prRefreshState.sequence++
  return prRefreshState.sequence
}

export function nextPRRefreshQueueOrder(): number {
  prRefreshState.queueOrder++
  return prRefreshState.queueOrder
}

export function broadcastPRRefresh(
  event: Omit<GitHubPRRefreshEvent, 'sequence'>,
  sequenceOverride?: number
): void {
  const payload = {
    ...event,
    sequence: sequenceOverride ?? nextPRRefreshSequence()
  } as GitHubPRRefreshEvent
  publishGitHubEvent({ type: 'prRefresh', event: payload })
}

export function recordPRRefreshQueueDiagnostic(
  event: 'enqueued' | 'coalesced' | 'skipped' | 'background-pause',
  reason: GitHubPRRefreshReason,
  skippedReason?: GitHubPRRefreshSkippedReason
): void {
  const counters = prRefreshState.diagnostics
  recordCoalescedCrashBreadcrumb({
    name: 'pr_refresh_queue',
    coalesceKey: `pr-refresh-queue:${event}:${reason}:${skippedReason ?? ''}`,
    minIntervalMs: DIAGNOSTIC_BREADCRUMB_MIN_INTERVAL_MS,
    data: {
      event,
      reason,
      ...(skippedReason ? { skippedReason } : {}),
      enqueued: counters.enqueued,
      coalesced: counters.coalesced,
      skipped: counters.skipped,
      backgroundPauses: counters.backgroundPauses
    }
  })
}
