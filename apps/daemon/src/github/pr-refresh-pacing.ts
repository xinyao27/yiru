import type { GitHubPRRefreshReason } from '@yiru/runtime-protocol/workbench/types'

import { isBudgetedBackgroundReason } from './pr-refresh-candidate'
import { prRefreshState, type PRRefreshQueueEntry } from './pr-refresh-state'

const BACKGROUND_BUDGET_WINDOW_MS = 5 * 60000
const MIN_BACKGROUND_SPACING_MS = 10000
const BACKGROUND_BUDGET_MAX = 20
const ACTIVE_BURST_WINDOW_MS = 30000
const ACTIVE_BURST_MAX = 3

export function isBackgroundPRRefresh(reason: GitHubPRRefreshReason): boolean {
  return reason !== 'manual'
}

export function isBudgetedQueueEntry(entry: PRRefreshQueueEntry): boolean {
  return isBudgetedBackgroundReason(entry.reason) && entry.bypassBackgroundBudget !== true
}

export function backgroundRefreshBuckets(): ('core' | 'graphql')[] {
  return ['core', 'graphql']
}

export function noteBackgroundStart(): void {
  const now = Date.now()
  prRefreshState.lastBackgroundStartAt = now
  prRefreshState.backgroundStarts.push(now)
  pruneBackgroundStarts(now)
}

export function nextBackgroundBudgetDelay(): number {
  const now = Date.now()
  pruneBackgroundStarts(now)
  const spacingDelay =
    prRefreshState.lastBackgroundStartAt > 0
      ? Math.max(0, MIN_BACKGROUND_SPACING_MS - (now - prRefreshState.lastBackgroundStartAt))
      : 0
  const starts = prRefreshState.backgroundStarts
  const windowDelay =
    starts.length < BACKGROUND_BUDGET_MAX
      ? 0
      : Math.max(1000, BACKGROUND_BUDGET_WINDOW_MS - (now - starts[0]))
  return Math.max(spacingDelay, windowDelay)
}

export function noteActiveStart(entry: PRRefreshQueueEntry): void {
  const now = Date.now()
  const scope = activeBurstScope(entry)
  const starts = pruneActiveStarts(scope, now)
  starts.push(now)
  prRefreshState.activeStartsByScope.set(scope, starts)
}

export function clearActiveBurstWindow(windowId: number): void {
  const prefix = `${windowId}::`
  for (const scope of prRefreshState.activeStartsByScope.keys()) {
    if (scope.startsWith(prefix)) {
      prRefreshState.activeStartsByScope.delete(scope)
    }
  }
}

export function prRefreshEntryDelay(entry: PRRefreshQueueEntry): number {
  const activeDelay = entry.reason === 'active' ? nextActiveBurstDelay(entry) : 0
  return activeDelay > 0
    ? activeDelay
    : isBudgetedQueueEntry(entry)
      ? nextBackgroundBudgetDelay()
      : 0
}

export function isActiveBurstDelayed(entry: PRRefreshQueueEntry): boolean {
  return entry.reason === 'active' && nextActiveBurstDelay(entry) > 0
}

export function nextQueuedWakeDelay(excludedKey: string): number | null {
  const now = Date.now()
  let nextDelay = Number.POSITIVE_INFINITY
  for (const entry of prRefreshState.queue.values()) {
    if (entry.key !== excludedKey) {
      const delay = entry.dueAt > now ? entry.dueAt - now : prRefreshEntryDelay(entry)
      nextDelay = Math.min(nextDelay, delay)
    }
  }
  return Number.isFinite(nextDelay) ? Math.max(0, nextDelay) : null
}

export function queuedEntriesByPriority(): PRRefreshQueueEntry[] {
  const now = Date.now()
  return Array.from(prRefreshState.queue.values()).sort((left, right) => {
    const leftReady = left.dueAt <= now
    const rightReady = right.dueAt <= now
    if (leftReady && rightReady) {
      return right.priority - left.priority || activeOrder(left, right) || left.dueAt - right.dueAt
    }
    if (leftReady !== rightReady) {
      return leftReady ? -1 : 1
    }
    return left.dueAt - right.dueAt || right.priority - left.priority
  })
}

function pruneBackgroundStarts(now: number): void {
  while (
    prRefreshState.backgroundStarts.length > 0 &&
    now - prRefreshState.backgroundStarts[0] > BACKGROUND_BUDGET_WINDOW_MS
  ) {
    prRefreshState.backgroundStarts.shift()
  }
}

function activeBurstScope(entry: PRRefreshQueueEntry): string {
  const runtimeScope = `local:${entry.candidate.localGitOptions?.wslDistro ?? 'host'}`
  return `${entry.windowId ?? 'global'}::${runtimeScope}`
}

function pruneActiveStarts(scope: string, now: number): number[] {
  const starts = prRefreshState.activeStartsByScope.get(scope) ?? []
  while (starts.length > 0 && now - starts[0] >= ACTIVE_BURST_WINDOW_MS) {
    starts.shift()
  }
  if (starts.length === 0) {
    prRefreshState.activeStartsByScope.delete(scope)
  } else {
    prRefreshState.activeStartsByScope.set(scope, starts)
  }
  return starts
}

function nextActiveBurstDelay(entry: PRRefreshQueueEntry): number {
  const now = Date.now()
  const starts = pruneActiveStarts(activeBurstScope(entry), now)
  return starts.length < ACTIVE_BURST_MAX
    ? 0
    : Math.max(1, ACTIVE_BURST_WINDOW_MS - (now - starts[0]))
}

function activeOrder(left: PRRefreshQueueEntry, right: PRRefreshQueueEntry): number {
  return left.reason === 'active' &&
    right.reason === 'active' &&
    activeBurstScope(left) === activeBurstScope(right)
    ? right.queuedAt - left.queuedAt
    : 0
}
