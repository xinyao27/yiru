import type { FsChangedPayload } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc, createRuntimeOrpcClient, type RuntimeClientTarget } from '../orpc-client'
import { getActiveRuntimeTarget } from '../rpc-client'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import type { RuntimeFileOperationArgs } from './context'

type RuntimeFileWatchEvent =
  | { type: 'starting'; subscriptionId: string }
  | { type: 'ready'; subscriptionId: string }
  | { type: 'changed'; worktree: string; events: FsChangedPayload['events'] }
  | { type: 'error'; message: string }
  | { type: 'end' }

type RuntimeFileWatchListener = {
  onPayload: (payload: FsChangedPayload) => void
  onError?: (error: Error) => void
}

type SharedRuntimeFileWatch = {
  target: RuntimeClientTarget
  worktreeId: string
  listeners: Set<RuntimeFileWatchListener>
  start: Promise<void>
  unsubscribe: (() => void) | null
  remoteSubscriptionId: string | null
  keepStreamUntilReady: boolean
  closed: boolean
}

const sharedRuntimeFileWatches = new Map<string, SharedRuntimeFileWatch>()

export async function subscribeRuntimeFileChanges(
  context: RuntimeFileOperationArgs,
  onPayload: (payload: FsChangedPayload) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (!context.worktreeId || !context.worktreePath) {
    throw new Error('A runtime file watch requires an owning worktree')
  }
  const listener: RuntimeFileWatchListener = { onPayload, onError }
  const key = getSharedRuntimeFileWatchKey(target, context.worktreeId, context.worktreePath)
  let shared = sharedRuntimeFileWatches.get(key)
  if (!shared) {
    shared = createSharedRuntimeFileWatch(key, target, context.worktreeId, context.worktreePath)
    sharedRuntimeFileWatches.set(key, shared)
  }
  shared.listeners.add(listener)
  try {
    await shared.start
  } catch (error) {
    shared.listeners.delete(listener)
    throw error
  }
  return () => {
    const current = sharedRuntimeFileWatches.get(key)
    if (!current) {
      return
    }
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      closeSharedRuntimeFileWatch(key, current)
    }
  }
}

function getSharedRuntimeFileWatchKey(
  target: RuntimeClientTarget,
  worktreeId: string,
  worktreePath: string
): string {
  const targetKey = target.kind === 'environment' ? target.environmentId : 'local'
  return `${targetKey}\0${worktreeId}\0${worktreePath}`
}

function createSharedRuntimeFileWatch(
  key: string,
  target: RuntimeClientTarget,
  worktreeId: string,
  worktreePath: string
): SharedRuntimeFileWatch {
  const shared: SharedRuntimeFileWatch = {
    target,
    worktreeId,
    listeners: new Set(),
    start: Promise.resolve(),
    unsubscribe: null,
    remoteSubscriptionId: null,
    keepStreamUntilReady: isWebRuntimeFileWatchSharedSocket(),
    closed: false
  }
  // Why: editor reloads and Explorer can watch the same remote worktree. Keep
  // one server watcher and fan out events in the renderer.
  shared.start = startSharedRuntimeFileWatch(key, shared, worktreePath).catch((error) => {
    failSharedRuntimeFileWatch(
      key,
      shared,
      error instanceof Error ? error : new Error(String(error))
    )
    throw error
  })
  return shared
}

async function startSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  worktreePath: string
): Promise<void> {
  const abort = new AbortController()
  const connection = await createRuntimeOrpcClient(shared.target, {
    timeoutMs: 15_000,
    signal: abort.signal
  })
  try {
    const stream = await connection.client.files.watch(
      { worktree: toRuntimeWorktreeSelector(shared.worktreeId) },
      { signal: abort.signal }
    )
    shared.unsubscribe = () => {
      // Why: oRPC encodes its abort frame asynchronously, so the connection must
      // detach that listener before the signal fires against a closed transport.
      connection.close()
      abort.abort()
    }
    if (shared.closed || sharedRuntimeFileWatches.get(key) !== shared) {
      shared.unsubscribe()
      shared.unsubscribe = null
      if (!shared.keepStreamUntilReady) {
        unwatchSharedRuntimeFileWatch(shared)
      }
      return
    }
    void consumeSharedRuntimeFileWatch(key, shared, worktreePath, stream).finally(() => {
      connection.close()
      if (sharedRuntimeFileWatches.get(key) === shared && !shared.closed) {
        sharedRuntimeFileWatches.delete(key)
        shared.closed = true
        shared.unsubscribe = null
      }
    })
  } catch (error) {
    connection.close()
    throw error
  }
}

async function consumeSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  worktreePath: string,
  stream: AsyncIterator<RuntimeFileWatchEvent> & AsyncIterable<RuntimeFileWatchEvent>
): Promise<void> {
  try {
    for await (const event of stream) {
      if (event.type === 'starting' || event.type === 'ready') {
        shared.remoteSubscriptionId = event.subscriptionId
        if (shared.closed) {
          shared.unsubscribe?.()
          shared.unsubscribe = null
          if (!shared.keepStreamUntilReady) {
            unwatchSharedRuntimeFileWatch(shared)
          }
        }
      } else if (event.type === 'changed') {
        for (const listener of Array.from(shared.listeners)) {
          listener.onPayload({ worktreePath, events: event.events })
        }
      } else if (event.type === 'error') {
        failSharedRuntimeFileWatch(key, shared, new Error(event.message))
      } else if (event.type === 'end') {
        if (sharedRuntimeFileWatches.get(key) === shared) {
          sharedRuntimeFileWatches.delete(key)
        }
        shared.closed = true
        const unsubscribe = shared.unsubscribe
        shared.unsubscribe = null
        shared.remoteSubscriptionId = null
        shared.listeners.clear()
        unsubscribe?.()
      }
    }
  } catch (error) {
    if (!shared.closed) {
      failSharedRuntimeFileWatch(
        key,
        shared,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }
}

function failSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  error: Error
): void {
  if (sharedRuntimeFileWatches.get(key) === shared) {
    sharedRuntimeFileWatches.delete(key)
  }
  shared.closed = true
  shared.remoteSubscriptionId = null
  const unsubscribe = shared.unsubscribe
  shared.unsubscribe = null
  const listeners = Array.from(shared.listeners)
  shared.listeners.clear()
  unsubscribe?.()
  for (const listener of listeners) {
    listener.onError?.(error)
  }
}

function closeSharedRuntimeFileWatch(key: string, shared: SharedRuntimeFileWatch): void {
  if (shared.closed) {
    return
  }
  shared.closed = true
  sharedRuntimeFileWatches.delete(key)
  if (shared.keepStreamUntilReady) {
    // Why: WebRuntimeClient owns shared-socket cleanup, including late-ready
    // files.unwatch after cancellation.
    shared.unsubscribe?.()
    shared.unsubscribe = null
    return
  }
  shared.unsubscribe?.()
  shared.unsubscribe = null
  unwatchSharedRuntimeFileWatch(shared)
}

function isWebRuntimeFileWatchSharedSocket(): boolean {
  return Boolean((globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__)
}

function unwatchSharedRuntimeFileWatch(shared: SharedRuntimeFileWatch): void {
  if (!shared.remoteSubscriptionId) {
    return
  }
  void callRuntimeOrpc(
    shared.target,
    (client) => client.files.unwatch,
    { subscriptionId: shared.remoteSubscriptionId },
    { timeoutMs: 5_000 }
  ).catch(() => {})
}
