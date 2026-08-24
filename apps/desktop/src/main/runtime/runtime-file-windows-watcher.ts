import { watch as watchFs } from 'node:fs'

import { PhysicalExitTracker } from '~shared/physical-exit-tracker'
import type { FsChangeEvent } from '~shared/types'

import { WatcherProcessFailure } from '../filesystem/parcel-watcher-process-failure'
import {
  WINDOWS_RUNTIME_FILE_WATCH_DEBOUNCE_MS,
  WINDOWS_RUNTIME_FILE_WATCH_CLOSE_DEADLINE_MS
} from './runtime-file-foundation'

export function watchWindowsRuntimeFileExplorer(
  rootPath: string,
  callback: (events: FsChangeEvent[]) => void,
  onTerminalError: (error: Error) => void
): () => Promise<void> {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let closeStarted = false
  const physicalClose = new PhysicalExitTracker()

  const emitOverflow = (): void => {
    timer = null
    if (disposed) {
      return
    }
    callback([{ kind: 'overflow', absolutePath: rootPath }])
  }

  const scheduleOverflow = (): void => {
    if (disposed) {
      return
    }
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(emitOverflow, WINDOWS_RUNTIME_FILE_WATCH_DEBOUNCE_MS)
  }

  // Why: Parcel probes Watchman before the Windows backend and its native
  // watcher can abort the headless runtime process. For remote Windows runtimes,
  // a conservative overflow refresh is safer than a process-wide native crash.
  const watcher = watchFs(rootPath, { recursive: true }, scheduleOverflow)
  const onClose = (): void => {
    watcher.removeListener('error', onError)
    physicalClose.markExited()
  }
  const onError = (err: Error): void => {
    console.error('[runtime-files.watch] Windows watcher error', { rootPath, err })
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    watcher.removeListener('close', onClose)
    watcher.removeListener('error', onError)
    // Why: Node closes and nulls FSWatcher's native handle on error without a
    // close event; that error is positive physical-exit proof for deletion.
    physicalClose.markExited()
    if (!disposed) {
      try {
        callback([{ kind: 'overflow', absolutePath: rootPath }])
      } finally {
        onTerminalError(err)
      }
    }
  }
  watcher.once('close', onClose)
  watcher.on('error', onError)

  return async () => {
    disposed = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!closeStarted) {
      try {
        watcher.close()
      } catch (err) {
        console.error('[runtime-files.watch] Windows watcher close error', { rootPath, err })
        throw err
      }
      closeStarted = true
    }
    try {
      await physicalClose.waitForExit(
        WINDOWS_RUNTIME_FILE_WATCH_CLOSE_DEADLINE_MS,
        () => new Error('Windows watcher did not close before deletion deadline')
      )
    } catch (error) {
      // Why: late Windows close still owns native directory handles; expose its
      // exact completion so destructive cleanup retains and then clears the root.
      throw new WatcherProcessFailure(
        error instanceof Error ? error.message : String(error),
        'supervisor',
        'process_unavailable',
        physicalClose.exitedPromise
      )
    }
  }
}
