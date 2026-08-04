import { stat } from 'node:fs/promises'
import * as path from 'node:path'

import type { Event as WatcherEvent } from '@parcel/watcher'
import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '@yiru/workbench-model/platform'
/* eslint-disable max-lines -- Why: filesystem-watcher centralizes native
(@parcel/watcher) and WSL-native snapshot lifecycles so subscription/cleanup
invariants stay auditable with the shared debounce and batch-flush paths. */
import { ipcMain, type WebContents } from 'electron'
import type { FsChangeEvent, FsChangedPayload } from '~shared/types'

import { isWslPath } from '../wsl'
import {
  onWatcherChildCapacityAvailable,
  WatcherChildCapacityError
} from './parcel-watcher-child-registry'
import { disposeWatcherProcess, subscribeViaWatcherProcess } from './parcel-watcher-process'
import { isWatcherProcessFailure } from './parcel-watcher-process-failure'
import { MAX_BATCHED_WATCHER_EVENTS, queueWatcherEvents } from './watcher-event-batch'
// Why: high-churn directories are suppressed at the native watcher level so
// events never leave the OS/daemon. This list is separate from the File
// Explorer display filter (which only hides rows). Directories like `dist`
// and `build` remain visible in the tree but will not auto-refresh.
import { WATCHER_IGNORE_DIRS, buildParcelWatcherIgnoreOptions } from './watcher-ignore'
import { beginWatcherInstall, isWatcherRemovalInProgressError } from './watcher-removal-gate'
import { createWslWatcher } from './watcher-wsl'
import type { WatchedRoot } from './watcher-wsl'

// ── Debounce helpers ─────────────────────────────────────────────────

const DEBOUNCE_TRAILING_MS = 150
const DEBOUNCE_MAX_WAIT_MS = 500

// ── Per-root watcher state ───────────────────────────────────────────
// WatchedRoot and WatcherSubscription are defined in watcher-wsl.ts
// and re-used here so both native and WSL watchers share the same shape.

// ── Module state ─────────────────────────────────────────────────────

const watchedRoots = new Map<string, WatchedRoot>()

// Why: roots that failed watcher creation (e.g. WSL UNC paths where
// @parcel/watcher's ReadDirectoryChangesW doesn't work) are cached so
// we don't retry on every worktree switch and spam the console with
// repeated "Failed to read changes" / "watchman not found" errors.
const UNWATCHABLE_ROOT_CACHE_MAX = 256
const unwatchableRoots = new Set<string>()

function rememberUnwatchableRoot(rootKey: string): void {
  // Why: missing/deleted worktrees can churn through unique paths during a long
  // session; keep retry suppression useful without retaining every failed path.
  unwatchableRoots.delete(rootKey)
  unwatchableRoots.add(rootKey)
  while (unwatchableRoots.size > UNWATCHABLE_ROOT_CACHE_MAX) {
    const oldest = unwatchableRoots.keys().next().value
    if (oldest === undefined) {
      break
    }
    unwatchableRoots.delete(oldest)
  }
}

// Why: watcher cleanup is keyed to the renderer WebContents, not to a specific
// watched root. One listener per sender avoids MaxListeners warnings when a
// workspace has many local worktrees open.
const senderCleanupRegistered = new Set<number>()

// Why: on Windows, tearing down and recreating @parcel/watcher subscriptions
// is expensive (ReadDirectoryChangesW setup + antivirus scanning can take
// 500 ms+).  A 30 s grace period lets rapid worktree switches reuse the
// existing watcher instead of paying the creation cost on every switch.
// Key: rootKey, Value: pending teardown timer.
const WATCHER_TEARDOWN_GRACE_MS = 30_000
const pendingTeardowns = new Map<string, ReturnType<typeof setTimeout>>()
// Why: @parcel/watcher unsubscribe completes native async work. Sender-destroy
// cleanup can start it before app shutdown, so will-quit must still await it.
const pendingLocalUnsubscribes = new Set<Promise<void>>()
const pendingLocalUnsubscribesByRoot = new Map<string, Set<Promise<void>>>()
const suspendedLocalWatcherListeners = new Map<
  string,
  { worktreePath: string; listeners: Map<number, WebContents> }
>()
// Why: an install cancelled by shutdown cannot be revived by a waiter that
// resumes after a later handler call reopens the watcher subsystem.
let localWatchersClosed = false
let localWatcherLifecycleGeneration = 0
const failedLocalUnsubscribes = new Map<string, unknown>()
type LocalWatcherInstallToken = {
  cancelled: boolean
  listeners: Map<number, WebContents>
  abortController: AbortController
}
type LocalWatcherInstallResult = 'installed' | 'unavailable' | 'capacity' | 'cancelled'
type LocalWatcherCapacityRetry = {
  listeners: Map<number, WebContents>
  cancelWait: () => void
}
// Why: native watcher creation is async. Concurrent local watch requests for
// the same root must share one install or later resolves can orphan listeners.
const inFlightLocalInstalls = new Map<string, LocalWatcherInstallToken>()
const pendingLocalInstallPromises = new Map<string, Promise<LocalWatcherInstallResult>>()
const pendingLocalCapacityRetries = new Map<string, LocalWatcherCapacityRetry>()

function addInFlightLocalInstallListener(
  token: LocalWatcherInstallToken,
  sender: WebContents
): void {
  if (sender.isDestroyed() || token.abortController.signal.aborted) {
    return
  }
  token.listeners.set(sender.id, sender)
  token.cancelled = false
  registerSenderCleanup(sender)
}

function cleanupInFlightLocalInstallsForSender(senderId: number): void {
  for (const token of inFlightLocalInstalls.values()) {
    token.listeners.delete(senderId)
    if (token.listeners.size === 0) {
      token.cancelled = true
      // Why: match closeLocalWatcherForWorktreePath / closeAllWatchers — abort
      // so a pending native/forked subscription stops early, not at completion.
      token.abortController.abort()
    }
  }
  for (const [rootKey, retry] of pendingLocalCapacityRetries) {
    retry.listeners.delete(senderId)
    if (retry.listeners.size === 0) {
      retry.cancelWait()
      pendingLocalCapacityRetries.delete(rootKey)
    }
  }
}

function takeLocalCapacityRetryListeners(rootKey: string): WebContents[] {
  const retry = pendingLocalCapacityRetries.get(rootKey)
  if (!retry) {
    return []
  }
  retry.cancelWait()
  pendingLocalCapacityRetries.delete(rootKey)
  return [...retry.listeners.values()].filter((listener) => !listener.isDestroyed())
}

function clearLocalCapacityRetry(rootKey: string): void {
  const retry = pendingLocalCapacityRetries.get(rootKey)
  retry?.cancelWait()
  pendingLocalCapacityRetries.delete(rootKey)
}

function scheduleLocalCapacityRetry(
  rootKey: string,
  worktreePath: string,
  listeners: Map<number, WebContents>
): void {
  const existing = pendingLocalCapacityRetries.get(rootKey)
  if (existing) {
    for (const listener of listeners.values()) {
      if (!listener.isDestroyed()) {
        existing.listeners.set(listener.id, listener)
      }
    }
    return
  }

  let retry!: LocalWatcherCapacityRetry
  const cancelWait = onWatcherChildCapacityAvailable(async () => {
    if (pendingLocalCapacityRetries.get(rootKey) !== retry) {
      return
    }
    pendingLocalCapacityRetries.delete(rootKey)
    await Promise.all(
      [...retry.listeners.values()].map(async (listener) => {
        if (listener.isDestroyed()) {
          return
        }
        await subscribe(worktreePath, listener).catch((error: unknown) => {
          if (!isWatcherRemovalInProgressError(error)) {
            console.error(`[filesystem-watcher] capacity retry failed for ${rootKey}:`, error)
          }
        })
      })
    )
  })
  retry = { listeners: new Map(), cancelWait }
  pendingLocalCapacityRetries.set(rootKey, retry)
  for (const listener of listeners.values()) {
    if (!listener.isDestroyed()) {
      retry.listeners.set(listener.id, listener)
      registerSenderCleanup(listener)
    }
  }
  if (retry.listeners.size === 0) {
    clearLocalCapacityRetry(rootKey)
  }
}

// ── Path normalization ───────────────────────────────────────────────

function normalizeRootPath(rootPath: string): string {
  let resolved = isWindowsAbsolutePathLike(rootPath)
    ? path.win32.resolve(rootPath)
    : path.resolve(rootPath)
  // Why: on Windows, watcher events may report lowercase drive letters while
  // stored worktree paths use uppercase. Normalizing here ensures the renderer's
  // POSIX normalization produces casing-consistent results (see design §4.4).
  if (/^[a-zA-Z]:/.test(resolved)) {
    resolved = resolved.charAt(0).toUpperCase() + resolved.slice(1)
  }
  return resolved
}

function localWatcherRoot(rootPath: string): { key: string; path: string } {
  const normalizedPath = normalizeRootPath(rootPath)
  return {
    // Why: Windows drive and UNC paths are case-insensitive; destructive
    // cleanup must find the owner even when Git returns a different spelling.
    key: normalizeRuntimePathForComparison(normalizedPath),
    path: normalizedPath
  }
}

function normalizeEventPath(eventPath: string): string {
  let resolved = path.resolve(eventPath)
  if (/^[a-zA-Z]:/.test(resolved)) {
    resolved = resolved.charAt(0).toUpperCase() + resolved.slice(1)
  }
  return resolved
}

// ── Event coalescing ─────────────────────────────────────────────────
// Why: within a single flush window the same path can appear multiple times.
// Keep the last event per path, except: delete→create emits both (the delete
// triggers subtree cleanup, the create triggers parent refresh); create→delete
// is dropped entirely (net no-op). See design §4.4.

function coalesceEvents(
  raw: WatcherEvent[]
): { type: 'create' | 'update' | 'delete'; path: string }[] {
  const lastByPath = new Map<string, { type: 'create' | 'update' | 'delete'; index: number }>()
  const deleteBeforeCreate = new Set<string>()

  for (let i = 0; i < raw.length; i++) {
    const evt = raw[i]
    const p = normalizeEventPath(evt.path)
    const prev = lastByPath.get(p)

    if (prev) {
      // delete followed by create → emit both
      if (prev.type === 'delete' && evt.type === 'create') {
        deleteBeforeCreate.add(p)
      }
      // create followed by delete → net no-op, remove both
      if (prev.type === 'create' && evt.type === 'delete') {
        lastByPath.delete(p)
        deleteBeforeCreate.delete(p)
        continue
      }
    }

    lastByPath.set(p, { type: evt.type, index: i })

    // Why: if a later event (e.g. update) supersedes a delete→create sequence,
    // the stale delete must be dropped. Otherwise the final output would include
    // a spurious delete + the new event type (e.g. delete→create→update would
    // emit delete+update, but the file exists so the delete is wrong). See §4.4.
    if (evt.type !== 'create' && deleteBeforeCreate.has(p)) {
      deleteBeforeCreate.delete(p)
    }
  }

  const result: { type: 'create' | 'update' | 'delete'; path: string }[] = []

  // Emit delete events first for paths that have delete→create
  for (const p of deleteBeforeCreate) {
    result.push({ type: 'delete', path: p })
  }

  // Emit the last event for each path
  for (const [p, entry] of lastByPath) {
    result.push({ type: entry.type, path: p })
  }

  return result
}

// ── Stat helper for isDirectory ──────────────────────────────────────

async function tryStatIsDirectory(filePath: string): Promise<boolean | undefined> {
  try {
    const s = await stat(filePath)
    return s.isDirectory()
  } catch {
    // Why: if stat fails (EPERM, vanished temp file), return undefined.
    // The renderer treats undefined the same as a file event (parent-only
    // invalidation), which is the safe default. See design §4.4.
    return undefined
  }
}

// ── Flush and emit ───────────────────────────────────────────────────

function emitOverflowPayload(rootKey: string, root: WatchedRoot): void {
  const rootPath = root.rootPath ?? rootKey
  const payload: FsChangedPayload = {
    worktreePath: rootPath,
    events: [{ kind: 'overflow', absolutePath: rootPath }]
  }
  for (const [, wc] of root.listeners) {
    if (!wc.isDestroyed()) {
      wc.send('fs:changed', payload)
    }
  }
}

async function flushBatch(rootKey: string, root: WatchedRoot): Promise<void> {
  const overflowed = root.batch.overflowed
  const rawEvents = root.batch.events.splice(0)
  root.batch.overflowed = false
  root.batch.timer = null
  root.batch.firstEventAt = 0

  if ((rawEvents.length === 0 && !overflowed) || root.listeners.size === 0) {
    return
  }

  if (overflowed || rawEvents.length > MAX_BATCHED_WATCHER_EVENTS) {
    // Why: deletion storms can be valid but too large to coalesce/stat/send
    // per path. One overflow asks the renderer for the same conservative refresh.
    emitOverflowPayload(rootKey, root)
    return
  }

  const coalesced = coalesceEvents(rawEvents)

  // Build the payload with isDirectory info
  const events: FsChangeEvent[] = await Promise.all(
    coalesced.map(async (evt) => {
      // Why: for delete events the path no longer exists on disk, so stat is
      // not possible. Set isDirectory to undefined and let the renderer infer
      // from dirCache (if the deleted path is a dirCache key, it's a directory).
      const isDirectory = evt.type === 'delete' ? undefined : await tryStatIsDirectory(evt.path)

      return {
        kind: evt.type,
        absolutePath: evt.path,
        isDirectory
      }
    })
  )

  const payload: FsChangedPayload = {
    worktreePath: root.rootPath ?? rootKey,
    events
  }

  for (const [, wc] of root.listeners) {
    if (!wc.isDestroyed()) {
      wc.send('fs:changed', payload)
    }
  }
}

function scheduleBatchFlush(rootKey: string, root: WatchedRoot): void {
  const now = Date.now()

  if (root.batch.firstEventAt === 0) {
    root.batch.firstEventAt = now
  }

  // If we've exceeded the max wait, flush immediately
  if (now - root.batch.firstEventAt >= DEBOUNCE_MAX_WAIT_MS) {
    if (root.batch.timer) {
      clearTimeout(root.batch.timer)
    }
    void flushBatch(rootKey, root)
    return
  }

  // Trailing-edge debounce: reset timer on each new event
  if (root.batch.timer) {
    clearTimeout(root.batch.timer)
  }
  root.batch.timer = setTimeout(() => void flushBatch(rootKey, root), DEBOUNCE_TRAILING_MS)
}

// ── Watcher creation ─────────────────────────────────────────────────

async function createWatcher(
  rootKey: string,
  rootPath: string,
  signal?: AbortSignal
): Promise<WatchedRoot> {
  const root: WatchedRoot = {
    subscription: null!,
    listeners: new Map(),
    batch: { events: [], overflowed: false, timer: null, firstEventAt: 0 },
    rootPath
  }

  try {
    // Why: track whether the error callback already ran cleanup before
    // subscribe() resolved.  If it did, the subscription object returned
    // by subscribe() would be orphaned (never stored in watchedRoots and
    // therefore never unsubscribed), leaking a native file-watcher handle.
    let errorCleanedUp = false

    const watcherOptions = {
      ...buildParcelWatcherIgnoreOptions(WATCHER_IGNORE_DIRS),
      // Why: Parcel checks Watchman before the native Windows backend by
      // default, and Windows prints a shell-level "watchman not recognized"
      // error for that probe. Pinning the backend keeps local watches quiet.
      ...(process.platform === 'win32' ? { backend: 'windows' as const } : {})
    }

    const markWatcherInterrupted = (): void => {
      root.batch.overflowed = true
      scheduleBatchFlush(rootKey, root)
    }

    // Why: subscriptions run in a forked watcher process (issue #7547 —
    // watcher.node teardown races fail-fast the hosting process). A watcher
    // crash there is recovered by resubscribing; onInterruption marks the
    // batch overflowed so the renderer refreshes past the event gap.
    root.subscription = await subscribeViaWatcherProcess(
      rootPath,
      (err, events) => {
        if (err) {
          // Why: watcher errors (including watched-root deletion) are treated
          // as overflow so the renderer conservatively refreshes all visible
          // tree state rather than trusting possibly-invalid caches (§7.2, §7.3).
          console.error(`[filesystem-watcher] error for ${rootKey}:`, err)
          emitOverflowPayload(rootKey, root)
          // Why: after a watcher error the native subscription may be invalid
          // (e.g. watched root was deleted). Tear down the dead watcher so we
          // don't leave a dangling subscription for a root that no longer
          // exists on disk (§7.3).
          if (root.batch.timer) {
            clearTimeout(root.batch.timer)
          }
          // Why: the error callback can fire before `watcher.subscribe()`
          // resolves and assigns root.subscription (e.g. the watched root
          // is deleted or inaccessible at startup).  Guard against null so
          // the cleanup path doesn't crash the main process.
          if (root.subscription) {
            retainLocalWatcherPhysicalFailure(rootKey, err)
            void trackLocalUnsubscribe(rootKey, root)
          }
          errorCleanedUp = true
          watchedRoots.delete(rootKey)
          return
        }

        queueWatcherEvents(root.batch, events)
        scheduleBatchFlush(rootKey, root)
      },
      watcherOptions,
      {
        delivery: { maxEventsPerBatch: MAX_BATCHED_WATCHER_EVENTS },
        // A child restart or bounded-queue overflow loses path precision; both
        // require the same conservative renderer refresh.
        onInterruption: markWatcherInterrupted,
        onOverflow: markWatcherInterrupted,
        signal
      }
    )

    // Why: if the error callback already fired and cleaned up watchedRoots
    // before subscribe() resolved, the subscription we just received is
    // orphaned.  Unsubscribe it immediately to avoid leaking a native
    // file-watcher handle that no code path would ever clean up.
    if (errorCleanedUp) {
      void trackLocalUnsubscribe(rootKey, root)
      throw new Error(`Watcher for ${rootKey} errored during subscribe`)
    }
  } catch (err) {
    // Why: if the watcher backend throws synchronously on a deleted root
    // or permission error, log rather than crashing the main process (§7.3).
    console.error(`[filesystem-watcher] failed to subscribe ${rootKey}:`, err)
    throw err
  }

  return root
}

// ── Subscribe / Unsubscribe ──────────────────────────────────────────

function cleanupLocalWatchersForSender(senderId: number): void {
  for (const [rootKey, suspended] of suspendedLocalWatcherListeners) {
    suspended.listeners.delete(senderId)
    if (suspended.listeners.size === 0) {
      suspendedLocalWatcherListeners.delete(rootKey)
    }
  }
  cleanupInFlightLocalInstallsForSender(senderId)
  for (const [key, watchedRoot] of watchedRoots) {
    if (watchedRoot.listeners.has(senderId)) {
      watchedRoot.listeners.delete(senderId)
      if (watchedRoot.listeners.size === 0) {
        // Cancel any pending grace-period teardown for this root.
        const pending = pendingTeardowns.get(key)
        if (pending) {
          clearTimeout(pending)
          pendingTeardowns.delete(key)
        }
        if (watchedRoot.batch.timer) {
          clearTimeout(watchedRoot.batch.timer)
        }
        trackLocalUnsubscribe(key, watchedRoot)
        watchedRoots.delete(key)
      }
    }
  }
}

function trackLocalUnsubscribe(rootKey: string, root: WatchedRoot): Promise<void> {
  const rootUnsubscribes = pendingLocalUnsubscribesByRoot.get(rootKey) ?? new Set<Promise<void>>()
  pendingLocalUnsubscribesByRoot.set(rootKey, rootUnsubscribes)
  const unsubscribePromise = Promise.resolve()
    .then(() => root.subscription.unsubscribe())
    .finally(() => {
      pendingLocalUnsubscribes.delete(unsubscribePromise)
      rootUnsubscribes.delete(unsubscribePromise)
      if (rootUnsubscribes.size === 0) {
        pendingLocalUnsubscribesByRoot.delete(rootKey)
      }
    })
  pendingLocalUnsubscribes.add(unsubscribePromise)
  rootUnsubscribes.add(unsubscribePromise)
  // Why: background cleanup must not create unhandled rejections, but the
  // original promise stays rejected so later destructive cleanup can fail closed.
  void unsubscribePromise.catch((error: unknown) => {
    retainLocalWatcherPhysicalFailure(rootKey, error)
    console.error(`[filesystem-watcher] unsubscribe error for ${rootKey}:`, error)
  })
  return unsubscribePromise
}

function retainLocalWatcherPhysicalFailure(rootKey: string, error: unknown): void {
  if (!isWatcherProcessFailure(error) || !error.physicalExit) {
    return
  }
  failedLocalUnsubscribes.set(rootKey, error)
  void error.physicalExit.then(() => {
    if (failedLocalUnsubscribes.get(rootKey) === error) {
      failedLocalUnsubscribes.delete(rootKey)
    }
  })
}

function registerSenderCleanup(sender: WebContents): void {
  if (senderCleanupRegistered.has(sender.id)) {
    return
  }
  senderCleanupRegistered.add(sender.id)
  sender.once('destroyed', () => {
    senderCleanupRegistered.delete(sender.id)
    cleanupLocalWatchersForSender(sender.id)
  })
}

function addLocalWatchListener(rootKey: string, sender: WebContents): void {
  const root = watchedRoots.get(rootKey)
  if (!root || sender.isDestroyed()) {
    return
  }
  root.listeners.set(sender.id, sender)
  registerSenderCleanup(sender)
}

async function subscribe(
  worktreePath: string,
  sender: WebContents,
  generation = localWatcherLifecycleGeneration
): Promise<void> {
  if (localWatchersClosed || generation !== localWatcherLifecycleGeneration) {
    return
  }
  const finishInstall = beginWatcherInstall(worktreePath)
  try {
    await subscribeWhileRemovalAllowed(worktreePath, sender, generation)
  } finally {
    finishInstall()
  }
}

async function subscribeWhileRemovalAllowed(
  worktreePath: string,
  sender: WebContents,
  generation: number
): Promise<void> {
  if (localWatchersClosed || generation !== localWatcherLifecycleGeneration) {
    return
  }
  const { key: rootKey, path: rootPath } = localWatcherRoot(worktreePath)
  if (sender.isDestroyed()) {
    return
  }

  // Don't retry roots that already failed — avoids repeated error spam.
  if (unwatchableRoots.has(rootKey)) {
    rememberUnwatchableRoot(rootKey)
    return
  }

  let root = watchedRoots.get(rootKey)

  // Cancel any pending grace-period teardown — a new listener arrived.
  const pendingTeardown = pendingTeardowns.get(rootKey)
  if (pendingTeardown) {
    clearTimeout(pendingTeardown)
    pendingTeardowns.delete(rootKey)
  }
  const capacityRetryListeners = takeLocalCapacityRetryListeners(rootKey)

  if (root) {
    for (const listener of capacityRetryListeners) {
      addLocalWatchListener(rootKey, listener)
    }
    addLocalWatchListener(rootKey, sender)
    return
  }

  const pendingInstall = pendingLocalInstallPromises.get(rootKey)
  if (pendingInstall) {
    const inFlight = inFlightLocalInstalls.get(rootKey)
    const canJoinInstall = inFlight && !inFlight.abortController.signal.aborted
    if (canJoinInstall) {
      // Why: an unwatch may cancel an install while another renderer is still
      // awaiting the same root; a new live listener should keep it alive.
      addInFlightLocalInstallListener(inFlight, sender)
      for (const listener of capacityRetryListeners) {
        addInFlightLocalInstallListener(inFlight, listener)
      }
    }
    const result = await pendingInstall
    if (
      result === 'cancelled' &&
      !canJoinInstall &&
      !localWatchersClosed &&
      generation === localWatcherLifecycleGeneration
    ) {
      // Why: AbortSignal cannot be revived. Listeners arriving after physical
      // cancellation wait out that generation, then own a fresh install.
      if (pendingLocalInstallPromises.get(rootKey) === pendingInstall) {
        pendingLocalInstallPromises.delete(rootKey)
      }
      const retryListeners = new Map(
        capacityRetryListeners.map((listener) => [listener.id, listener])
      )
      retryListeners.set(sender.id, sender)
      for (const listener of retryListeners.values()) {
        if (!listener.isDestroyed()) {
          await subscribeWhileRemovalAllowed(worktreePath, listener, generation)
        }
      }
      return
    }
    if (!inFlight) {
      if (result === 'installed') {
        for (const listener of capacityRetryListeners) {
          addLocalWatchListener(rootKey, listener)
        }
      } else if (result === 'capacity') {
        const retryListeners = new Map(
          capacityRetryListeners.map((listener) => [listener.id, listener])
        )
        retryListeners.set(sender.id, sender)
        scheduleLocalCapacityRetry(rootKey, worktreePath, retryListeners)
      }
    }
    if (
      result === 'installed' &&
      watchedRoots.has(rootKey) &&
      !sender.isDestroyed() &&
      (!inFlight || inFlight.listeners.has(sender.id))
    ) {
      addLocalWatchListener(rootKey, sender)
    }
    return
  }

  const cancelToken: LocalWatcherInstallToken = {
    cancelled: false,
    listeners: new Map(),
    abortController: new AbortController()
  }
  inFlightLocalInstalls.set(rootKey, cancelToken)
  for (const listener of capacityRetryListeners) {
    addInFlightLocalInstallListener(cancelToken, listener)
  }
  addInFlightLocalInstallListener(cancelToken, sender)
  const installPromise = doInstallLocalWatcher(rootKey, rootPath, worktreePath, cancelToken)
  pendingLocalInstallPromises.set(rootKey, installPromise)
  try {
    await installPromise
  } finally {
    if (pendingLocalInstallPromises.get(rootKey) === installPromise) {
      pendingLocalInstallPromises.delete(rootKey)
    }
  }
}

async function doInstallLocalWatcher(
  rootKey: string,
  rootPath: string,
  worktreePath: string,
  cancelToken: LocalWatcherInstallToken
): Promise<LocalWatcherInstallResult> {
  let root: WatchedRoot
  try {
    const s = await stat(rootPath)
    if (!s.isDirectory()) {
      console.warn(`[filesystem-watcher] not a directory: ${rootKey}`)
      rememberUnwatchableRoot(rootKey)
      return 'unavailable'
    }
  } catch {
    console.warn(`[filesystem-watcher] cannot stat root: ${rootKey}`)
    rememberUnwatchableRoot(rootKey)
    return 'unavailable'
  }

  try {
    // Why: WSL paths use one snapshot subprocess inside the Linux distro so
    // `wsl --shutdown` can kill it; native Windows paths use @parcel/watcher.
    root = isWslPath(worktreePath)
      ? await createWslWatcher(
          rootKey,
          worktreePath,
          {
            ignoreDirs: WATCHER_IGNORE_DIRS,
            scheduleBatchFlush,
            watchedRoots
          },
          cancelToken.abortController.signal
        )
      : await createWatcher(rootKey, rootPath, cancelToken.abortController.signal)
  } catch (error) {
    // Why: setup may fail after its child misses the exit deadline; retain that
    // owner even when the ordinary renderer-facing setup error is swallowed.
    retainLocalWatcherPhysicalFailure(rootKey, error)
    if (cancelToken.cancelled) {
      if (isWatcherProcessFailure(error) && error.code === 'process_unavailable') {
        throw error
      }
      return 'cancelled'
    }
    // Why: capacity is transient; once another physical child exits this root
    // must be allowed to retry instead of entering the permanent-failure cache.
    if (error instanceof WatcherChildCapacityError) {
      scheduleLocalCapacityRetry(rootKey, worktreePath, cancelToken.listeners)
      return 'capacity'
    }
    rememberUnwatchableRoot(rootKey)
    return 'unavailable'
  } finally {
    if (inFlightLocalInstalls.get(rootKey) === cancelToken) {
      inFlightLocalInstalls.delete(rootKey)
    }
  }

  const liveListeners = new Map(
    Array.from(cancelToken.listeners.entries()).filter(([, listener]) => !listener.isDestroyed())
  )
  if (cancelToken.cancelled || liveListeners.size === 0) {
    if (root.batch.timer) {
      clearTimeout(root.batch.timer)
    }
    void trackLocalUnsubscribe(rootKey, root)
    return 'cancelled'
  }

  root.listeners = liveListeners
  watchedRoots.set(rootKey, root)
  for (const listener of liveListeners.values()) {
    registerSenderCleanup(listener)
  }
  return 'installed'
}

function unsubscribe(worktreePath: string, senderId: number): void {
  const { key: rootKey } = localWatcherRoot(worktreePath)
  const suspended = suspendedLocalWatcherListeners.get(rootKey)
  suspended?.listeners.delete(senderId)
  if (suspended?.listeners.size === 0) {
    suspendedLocalWatcherListeners.delete(rootKey)
  }
  const capacityRetry = pendingLocalCapacityRetries.get(rootKey)
  if (capacityRetry) {
    capacityRetry.listeners.delete(senderId)
    if (capacityRetry.listeners.size === 0) {
      clearLocalCapacityRetry(rootKey)
    }
  }
  const inFlight = inFlightLocalInstalls.get(rootKey)
  if (inFlight) {
    inFlight.listeners.delete(senderId)
    inFlight.cancelled = inFlight.listeners.size === 0
    // Why: same early-cancel as closeLocalWatcherForWorktreePath — last normal
    // disconnect must abort the pending native/forked install, not let it finish.
    if (inFlight.cancelled) {
      inFlight.abortController.abort()
    }
  }

  const root = watchedRoots.get(rootKey)
  if (!root) {
    return
  }

  root.listeners.delete(senderId)

  // Defer watcher teardown when the last subscriber leaves so rapid
  // worktree switches can reuse the existing native watcher.
  if (root.listeners.size === 0) {
    if (root.batch.timer) {
      clearTimeout(root.batch.timer)
    }

    // Why: duplicate renderer cleanup can call unwatch more than once for a
    // root; keep one tracked grace timer instead of leaking overwritten timers.
    if (pendingTeardowns.has(rootKey)) {
      return
    }

    const teardownTimer = setTimeout(() => {
      pendingTeardowns.delete(rootKey)
      // Re-check: a new listener may have arrived during the grace period.
      const currentRoot = watchedRoots.get(rootKey)
      if (!currentRoot || currentRoot.listeners.size > 0) {
        return
      }
      void trackLocalUnsubscribe(rootKey, currentRoot)
      watchedRoots.delete(rootKey)
    }, WATCHER_TEARDOWN_GRACE_MS)

    pendingTeardowns.set(rootKey, teardownTimer)
  }
}

export async function closeLocalWatcherForWorktreePath(worktreePath: string): Promise<void> {
  const { key: rootKey } = localWatcherRoot(worktreePath)
  const suspended = suspendedLocalWatcherListeners.get(rootKey) ?? {
    worktreePath,
    listeners: new Map<number, WebContents>()
  }
  for (const source of [
    pendingLocalCapacityRetries.get(rootKey)?.listeners,
    inFlightLocalInstalls.get(rootKey)?.listeners,
    watchedRoots.get(rootKey)?.listeners
  ]) {
    for (const [senderId, sender] of source ?? []) {
      if (!sender.isDestroyed()) {
        suspended.listeners.set(senderId, sender)
      }
    }
  }
  if (suspended.listeners.size > 0) {
    suspendedLocalWatcherListeners.set(rootKey, suspended)
  }
  clearLocalCapacityRetry(rootKey)
  const pendingTeardown = pendingTeardowns.get(rootKey)
  if (pendingTeardown) {
    clearTimeout(pendingTeardown)
    pendingTeardowns.delete(rootKey)
  }

  const inFlight = inFlightLocalInstalls.get(rootKey)
  if (inFlight) {
    // Why: Windows keeps watched directories locked; deletion must be able to
    // cancel an in-flight subscription before Git tries to remove the tree.
    inFlight.listeners.clear()
    inFlight.cancelled = true
    inFlight.abortController.abort()
  }
  await pendingLocalInstallPromises.get(rootKey)
  const pendingUnsubscribes = pendingLocalUnsubscribesByRoot.get(rootKey)
  if (pendingUnsubscribes) {
    await Promise.all(Array.from(pendingUnsubscribes))
  }
  if (failedLocalUnsubscribes.has(rootKey)) {
    throw failedLocalUnsubscribes.get(rootKey)
  }

  const root = watchedRoots.get(rootKey)
  if (!root) {
    return
  }
  if (root.batch.timer) {
    clearTimeout(root.batch.timer)
  }
  watchedRoots.delete(rootKey)
  await trackLocalUnsubscribe(rootKey, root)
}

export async function restoreLocalWatcherAfterFailedRemoval(worktreePath: string): Promise<void> {
  const { key: rootKey } = localWatcherRoot(worktreePath)
  const suspended = suspendedLocalWatcherListeners.get(rootKey)
  if (!suspended) {
    return
  }
  suspendedLocalWatcherListeners.delete(rootKey)
  const failures: unknown[] = []
  const failedListeners = new Map<number, WebContents>()
  for (const sender of suspended.listeners.values()) {
    if (sender.isDestroyed()) {
      continue
    }
    try {
      await subscribe(suspended.worktreePath, sender)
      sender.send('fs:changed', {
        worktreePath: suspended.worktreePath,
        events: [{ kind: 'overflow', absolutePath: suspended.worktreePath }]
      } satisfies FsChangedPayload)
    } catch (error) {
      failures.push(error)
      failedListeners.set(sender.id, sender)
    }
  }
  if (failures.length > 0) {
    suspendedLocalWatcherListeners.set(rootKey, {
      worktreePath: suspended.worktreePath,
      listeners: failedListeners
    })
    throw failures[0]
  }
}

export function forgetLocalWatcherRemovalSnapshot(worktreePath: string): void {
  suspendedLocalWatcherListeners.delete(localWatcherRoot(worktreePath).key)
}

// ── Public API ───────────────────────────────────────────────────────

export function registerFilesystemWatcherHandlers(): void {
  ipcMain.handle(
    'fs:watchWorktree',
    async (event, args: { worktreePath: string; connectionId?: string }): Promise<void> => {
      // Why: tests and post-shutdown renderer reattachment reopen the local
      // subsystem, while stale callers retain the prior generation.
      localWatchersClosed = false
      await subscribe(args.worktreePath, event.sender)
    }
  )

  ipcMain.handle(
    'fs:unwatchWorktree',
    (_event, args: { worktreePath: string; connectionId?: string }): void => {
      const senderId = _event.sender.id
      unsubscribe(args.worktreePath, senderId)
    }
  )
}

/** Tear down all watchers on app shutdown. */
export async function closeAllWatchers(): Promise<void> {
  senderCleanupRegistered.clear()
  unwatchableRoots.clear()
  suspendedLocalWatcherListeners.clear()
  for (const retry of pendingLocalCapacityRetries.values()) {
    retry.cancelWait()
  }
  pendingLocalCapacityRetries.clear()

  // Cancel any pending grace-period teardowns — we're tearing down everything.
  for (const timer of pendingTeardowns.values()) {
    clearTimeout(timer)
  }
  pendingTeardowns.clear()

  // Why: latch the watcher subsystem shut so late installs cannot register
  // post-shutdown. Generation bumps also reject waiters from an older lifecycle.
  localWatchersClosed = true
  localWatcherLifecycleGeneration += 1
  for (const token of inFlightLocalInstalls.values()) {
    token.listeners.clear()
    token.cancelled = true
    token.abortController.abort()
  }

  for (const [rootKey, root] of watchedRoots) {
    if (root.batch.timer) {
      clearTimeout(root.batch.timer)
    }
    await trackLocalUnsubscribe(rootKey, root).catch(() => undefined)
  }
  watchedRoots.clear()
  await Promise.allSettled(Array.from(pendingLocalUnsubscribes))
  failedLocalUnsubscribes.clear()
  // Why: with every local subscription released, drop the forked watcher
  // process outright — process death frees any remaining native handles
  // without running watcher.node's crash-prone async teardown in this process.
  disposeWatcherProcess()
}
