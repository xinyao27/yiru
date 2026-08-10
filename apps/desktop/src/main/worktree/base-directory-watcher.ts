import type { Store } from '../persistence'
import {
  collectLocalWorktreeBaseChanges,
  type WorktreeBaseCollectedChanges
} from './base-directory-change-collector'
import type { WorktreeBaseWatchTarget } from './base-directory-event-filter'
import { startWorktreeBaseDirectoryPoller } from './base-directory-poller'
import {
  buildWorktreeBaseDirectoryWatchTargets,
  clearWorktreeBaseDirectoryWatchTargetWarnings
} from './base-directory-watch-targets'
import {
  createWorktreeHeadIdentityRefreshState,
  refreshWorktreeHeadIdentities,
  type WorktreeHeadIdentityRefreshState
} from './head-identity-refresh'
import { notifyWorktreeGitStatusMetadataChanged, notifyWorktreesChanged } from './remote'

type ActiveWatch = WorktreeBaseWatchTarget & {
  subscription: { unsubscribe: () => Promise<void> }
  notifyTimer: ReturnType<typeof setTimeout> | null
  pendingStructureRepoIds: Set<string>
  pendingGitStatusRepoIds: Set<string>
  pendingHeadIdentityRepoIds: Set<string>
  headIdentityRefresh: WorktreeHeadIdentityRefreshState
  disposed: boolean
}

const WATCH_DEBOUNCE_MS = 250
const activeWatches = new Map<string, ActiveWatch>()
let syncGeneration = 0
let scheduledSync: ReturnType<typeof setTimeout> | null = null
let latestSyncStore: Store | null = null

function clearPendingRepoIds(watch: ActiveWatch): void {
  watch.pendingStructureRepoIds.clear()
  watch.pendingGitStatusRepoIds.clear()
  watch.pendingHeadIdentityRepoIds.clear()
}

type PendingNotificationInput = Partial<Omit<WorktreeBaseCollectedChanges, 'overflow'>>

function scheduleNotification(watch: ActiveWatch, changes: PendingNotificationInput): void {
  if (watch.disposed) {
    clearPendingRepoIds(watch)
    return
  }
  for (const repoId of changes.structureRepoIds ?? []) {
    watch.pendingStructureRepoIds.add(repoId)
  }
  for (const repoId of changes.gitStatusRepoIds ?? []) {
    watch.pendingGitStatusRepoIds.add(repoId)
  }
  for (const repoId of changes.headIdentityRepoIds ?? []) {
    watch.pendingHeadIdentityRepoIds.add(repoId)
  }
  if (watch.notifyTimer) {
    clearTimeout(watch.notifyTimer)
  }
  watch.notifyTimer = setTimeout(() => {
    watch.notifyTimer = null
    if (watch.disposed) {
      clearPendingRepoIds(watch)
      return
    }
    const pendingStructure = [...watch.pendingStructureRepoIds]
    const hasHeadIdentity = watch.pendingHeadIdentityRepoIds.size > 0
    // Source Control refreshes on both index churn and head moves; structural
    // repos already refresh via the authoritative listing, so drop them here.
    const sourceControlRepoIds = new Set(
      [...watch.pendingGitStatusRepoIds, ...watch.pendingHeadIdentityRepoIds].filter(
        (repoId) => !watch.pendingStructureRepoIds.has(repoId)
      )
    )
    // Structural ticks refresh silently (emit=false): the authoritative listing
    // already reported them, so this only re-baselines ahead of later head diffs.
    const emitHeadIdentities = pendingStructure.length === 0
    clearPendingRepoIds(watch)
    for (const repoId of pendingStructure) {
      notifyWorktreesChanged(repoId)
    }
    for (const repoId of sourceControlRepoIds) {
      notifyWorktreeGitStatusMetadataChanged(repoId)
    }
    // Only re-read head identities for true head triggers: an index rewrite
    // cannot move HEAD, so status-only bursts skip the linked-worktree scan.
    if (supportsHeadIdentityRefresh(watch) && (pendingStructure.length > 0 || hasHeadIdentity)) {
      void refreshWorktreeHeadIdentities(watch, watch.headIdentityRefresh, emitHeadIdentities)
    }
  }, WATCH_DEBOUNCE_MS)
}

function supportsHeadIdentityRefresh(watch: ActiveWatch): boolean {
  return watch.kind === 'git-common'
}

function hasCollectedChanges(changes: WorktreeBaseCollectedChanges): boolean {
  return [changes.structureRepoIds, changes.gitStatusRepoIds, changes.headIdentityRepoIds].some(
    (ids) => ids.length > 0
  )
}

function handleLocalWatchEvents(
  watch: ActiveWatch,
  error: Error | null,
  events: { type: 'create' | 'update' | 'delete'; path: string }[]
): void {
  if (watch.disposed) {
    return
  }
  if (error) {
    console.warn(`[worktree-base-watcher] watcher failed for ${watch.path}:`, error)
    scheduleNotification(watch, { structureRepoIds: [...watch.repos.keys()] })
    return
  }
  const changes = collectLocalWorktreeBaseChanges(watch, events)
  if (hasCollectedChanges(changes)) {
    scheduleNotification(watch, changes)
  }
}

function createActiveWatch(
  target: WorktreeBaseWatchTarget,
  subscription: ActiveWatch['subscription']
): ActiveWatch {
  return {
    ...target,
    subscription,
    notifyTimer: null,
    pendingStructureRepoIds: new Set(),
    pendingGitStatusRepoIds: new Set(),
    pendingHeadIdentityRepoIds: new Set(),
    headIdentityRefresh: createWorktreeHeadIdentityRefreshState(),
    disposed: false
  }
}

async function subscribeTarget(target: WorktreeBaseWatchTarget): Promise<ActiveWatch> {
  let activeWatch: ActiveWatch | null = null
  // Why: a recursive native watcher here forced fseventsd to deliver every
  // event under the whole workspace root (all worktrees) / whole common .git
  // (objects included) just to observe a few shallow paths. The poller reads
  // exactly those paths and registers zero fseventsd clients.
  const subscription = await startWorktreeBaseDirectoryPoller(
    target,
    () => (activeWatches.get(target.key) ?? activeWatch)?.repos ?? target.repos,
    (events) => {
      const currentWatch = activeWatches.get(target.key) ?? activeWatch
      if (!currentWatch || currentWatch.disposed) {
        return
      }
      handleLocalWatchEvents(currentWatch, null, events)
    }
  )
  activeWatch = createActiveWatch(target, subscription)
  if (supportsHeadIdentityRefresh(activeWatch)) {
    // Baseline eagerly so the first status-only signal — possibly hours after
    // subscribe — diffs against subscribe-time heads instead of silently
    // re-baselining past an external commit.
    void refreshWorktreeHeadIdentities(activeWatch, activeWatch.headIdentityRefresh, false)
  }
  return activeWatch
}

async function replaceWatch(target: WorktreeBaseWatchTarget, generation: number): Promise<void> {
  const previous = activeWatches.get(target.key)
  if (previous) {
    previous.repos = target.repos
    return
  }
  try {
    const activeWatch = await subscribeTarget(target)
    if (generation !== syncGeneration) {
      activeWatch.disposed = true
      await activeWatch.subscription.unsubscribe().catch((error) => {
        console.warn(`[worktree-base-watcher] failed to unwatch stale ${target.path}:`, error)
      })
      return
    }
    activeWatches.set(target.key, activeWatch)
  } catch (error) {
    console.warn(`[worktree-base-watcher] failed to watch ${target.path}:`, error)
  }
}

async function removeWatch(key: string): Promise<void> {
  const watch = activeWatches.get(key)
  if (!watch) {
    return
  }
  activeWatches.delete(key)
  watch.disposed = true
  if (watch.notifyTimer) {
    clearTimeout(watch.notifyTimer)
  }
  clearPendingRepoIds(watch)
  await watch.subscription.unsubscribe().catch((error) => {
    console.warn(`[worktree-base-watcher] failed to unwatch ${watch.path}:`, error)
  })
}

export async function syncWorktreeBaseDirectoryWatchers(store: Store): Promise<void> {
  const generation = ++syncGeneration
  const targets = await buildWorktreeBaseDirectoryWatchTargets(store)
  if (generation !== syncGeneration) {
    return
  }
  for (const key of activeWatches.keys()) {
    if (generation !== syncGeneration) {
      return
    }
    if (!targets.has(key)) {
      await removeWatch(key)
      if (generation !== syncGeneration) {
        return
      }
    }
  }
  for (const target of targets.values()) {
    if (generation !== syncGeneration) {
      return
    }
    await replaceWatch(target, generation)
    if (generation !== syncGeneration) {
      return
    }
  }
}

export function setWorktreeBaseDirectoryWatcherSyncContext(store: Store): void {
  latestSyncStore = store
}

export function scheduleWorktreeBaseDirectoryWatcherSync(store: Store): void {
  if (scheduledSync) {
    clearTimeout(scheduledSync)
  }
  scheduledSync = setTimeout(() => {
    scheduledSync = null
    void syncWorktreeBaseDirectoryWatchers(store)
  }, 100)
}

export function scheduleCurrentWorktreeBaseDirectoryWatcherSync(): void {
  if (!latestSyncStore) {
    return
  }
  scheduleWorktreeBaseDirectoryWatcherSync(latestSyncStore)
}

export async function disposeWorktreeBaseDirectoryWatchers(): Promise<void> {
  syncGeneration++
  latestSyncStore = null
  if (scheduledSync) {
    clearTimeout(scheduledSync)
    scheduledSync = null
  }
  await Promise.all([...activeWatches.keys()].map((key) => removeWatch(key)))
  clearWorktreeBaseDirectoryWatchTargetWarnings()
}
