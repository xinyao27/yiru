import { existsSync, lstatSync, watch, type FSWatcher } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

import { isPathInsideOrEqual } from '@yiru/runtime-protocol/model/platform'
import type { FsChangeEvent } from '@yiru/runtime-protocol/workbench/types'

import { WATCHER_IGNORE_DIRS } from '../../filesystem/watcher-ignore'

const EVENT_BATCH_DELAY_MS = 20
const EVENT_BATCH_LIMIT = 200

type BunRootWatcher = {
  close: () => void
}

const rootWatchers = new Map<string, Set<BunRootWatcher>>()

export function closeBunFileExplorerWatchers(rootPath: string): void {
  for (const watcher of rootWatchers.get(rootPath) ?? []) {
    watcher.close()
  }
}

export function watchFileExplorerWithBun(
  rootPath: string,
  callback: (events: FsChangeEvent[]) => void,
  onTerminalError: (error: Error) => void,
  signal?: AbortSignal
): () => Promise<void> {
  if (signal?.aborted) {
    throw new Error('file watcher subscription aborted')
  }
  let nativeWatcher: FSWatcher | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let isClosed = false
  let hasOverflow = false
  const pending = new Map<string, FsChangeEvent>()

  const flush = (): void => {
    flushTimer = null
    if (isClosed) {
      pending.clear()
      return
    }
    if (hasOverflow) {
      hasOverflow = false
      pending.clear()
      callback([{ absolutePath: rootPath, kind: 'overflow' }])
      return
    }
    const events = Array.from(pending.values())
    pending.clear()
    if (events.length > 0) {
      callback(events)
    }
  }
  const scheduleFlush = (): void => {
    flushTimer ??= setTimeout(flush, EVENT_BATCH_DELAY_MS)
  }
  const enqueue = (event: FsChangeEvent): void => {
    if (pending.size >= EVENT_BATCH_LIMIT) {
      hasOverflow = true
    } else {
      pending.set(event.absolutePath, event)
    }
    scheduleFlush()
  }
  const close = (): void => {
    if (isClosed) {
      return
    }
    isClosed = true
    nativeWatcher?.close()
    nativeWatcher = null
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pending.clear()
    const watchers = rootWatchers.get(rootPath)
    watchers?.delete(owner)
    if (watchers?.size === 0) {
      rootWatchers.delete(rootPath)
    }
    signal?.removeEventListener('abort', close)
  }
  const owner: BunRootWatcher = { close }

  try {
    // Why: Bun's recursive fs.watch retains an OS-backed watcher on macOS,
    // Linux, and Windows without maintaining a second watcher runtime.
    nativeWatcher = watch(rootPath, { recursive: true }, (eventType, fileName) => {
      if (isClosed) {
        return
      }
      if (fileName === null) {
        hasOverflow = true
        scheduleFlush()
        return
      }
      const absolutePath = resolve(rootPath, String(fileName))
      if (!isPathInsideOrEqual(rootPath, absolutePath) || isIgnored(rootPath, absolutePath)) {
        return
      }
      if (eventType === 'change') {
        enqueue({ absolutePath, isDirectory: readIsDirectory(absolutePath), kind: 'update' })
        return
      }
      const isPresent = existsSync(absolutePath)
      enqueue({
        absolutePath,
        ...(isPresent ? { isDirectory: readIsDirectory(absolutePath) } : {}),
        kind: isPresent ? 'create' : 'delete'
      })
    })
    nativeWatcher.on('error', (error) => {
      close()
      onTerminalError(error)
    })
    const watchers = rootWatchers.get(rootPath) ?? new Set<BunRootWatcher>()
    watchers.add(owner)
    rootWatchers.set(rootPath, watchers)
    signal?.addEventListener('abort', close, { once: true })
  } catch (error) {
    close()
    throw error
  }

  let closePromise: Promise<void> | null = null
  return () => {
    close()
    closePromise ??= Promise.resolve()
    return closePromise
  }
}

function isIgnored(rootPath: string, absolutePath: string): boolean {
  const relativePath = relative(rootPath, absolutePath)
  return relativePath.split(sep).some((part) => WATCHER_IGNORE_DIRS.includes(part))
}

function readIsDirectory(path: string): boolean | undefined {
  try {
    return lstatSync(path).isDirectory()
  } catch {
    return undefined
  }
}
