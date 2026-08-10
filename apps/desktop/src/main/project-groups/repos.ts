import { homedir } from 'node:os'
import { join } from 'node:path'

import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
/* eslint-disable max-lines -- Why: repo IPC is intentionally centralized so host
routing, clone lifecycle, and store persistence stay behind a single audited
boundary. Splitting by line count would scatter tightly coupled repo behavior. */
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import { invalidateAuthorizedRootsCache } from '../filesystem/auth'
import type { MainIpcRegistration } from '../ipc-registration'
import type { Store } from '../persistence'
import { scheduleCurrentWorktreeBaseDirectoryWatcherSync } from '../worktree/base-directory-watcher'
import type { NativeDirectoryPicker } from './native-directory-picker'
import { publishRepoChangeEvent } from './repo-events'

function getDefaultCreateProjectParent(): string {
  return join(homedir(), 'yiru', 'projects')
}

export function registerRepoHandlers(
  ipcMain: MainIpcRegistration,
  store: Store,
  runtime: YiruRuntimeService,
  directoryPicker: NativeDirectoryPicker
): void {
  // Remove any previously registered handlers so we can re-register them
  // (e.g. when macOS re-activates the app and creates a new window).
  ipcMain.removeHandler('repo-host:removeForHost')
  ipcMain.removeHandler('repo-host:reorderForHost')
  ipcMain.removeHandler('repo-host:pickFolder')
  ipcMain.removeHandler('repo-host:pickFolders')
  ipcMain.removeHandler('repo-host:pickDirectory')
  ipcMain.removeHandler('repo-host:cloneAbort')
  ipcMain.removeHandler('repo-host:getDefaultCreateProjectParent')

  ipcMain.handle('repo-host:getDefaultCreateProjectParent', () => getDefaultCreateProjectParent())

  ipcMain.handle(
    'repo-host:reorderForHost',
    (
      _event,
      args: { orderedIds: string[]; hostId: string }
    ): { status: 'applied' | 'rejected' } => {
      const hostId = normalizeExecutionHostId(args?.hostId)
      if (!hostId) {
        return { status: 'rejected' }
      }
      const ids = Array.isArray(args?.orderedIds) ? args.orderedIds : []
      const applied = store.reorderReposForHost(ids, hostId)
      if (applied) {
        notifyReposChanged()
        return { status: 'applied' }
      }
      return { status: 'rejected' }
    }
  )

  // Why: forget a project on a single execution host without disturbing the
  // same repo id on another paired runtime. Used when a host-scoped project is
  // forgotten without removing an equal repo id elsewhere.
  ipcMain.handle(
    'repo-host:removeForHost',
    async (_event, args: { repoId: string; hostId: string }) => {
      const hostId = normalizeExecutionHostId(args.hostId)
      if (!hostId) {
        throw new Error(`Invalid host ID: ${args.hostId}`)
      }
      store.removeProjectForHost(args.repoId, hostId)
      invalidateAuthorizedRootsCache()
      notifyReposChanged()
    }
  )

  // ── Sparse presets ─────────────────────────────────────────────
  // Why: presets are repo-scoped reusable directory lists used by the
  // new-workspace composer. Persisted via Store and broadcast back to the
  // renderer so any open composer reflects new/edited/deleted presets
  // immediately.

  ipcMain.handle('repo-host:pickFolder', async () => {
    const paths = await directoryPicker.pickDirectory()
    return paths[0] ?? null
  })

  ipcMain.handle('repo-host:pickFolders', async () => {
    return directoryPicker.pickDirectory({ multiple: true })
  })

  // Why: pickDirectory is a generic "choose a folder" picker, separate from
  // pickFolder which is specifically the "add project" flow. Clone needs a
  // destination directory that may not be a git repo yet.
  ipcMain.handle('repo-host:pickDirectory', async () => {
    const paths = await directoryPicker.pickDirectory()
    return paths[0] ?? null
  })

  ipcMain.handle('repo-host:cloneAbort', () => runtime.abortRepoClone())
}

function notifyReposChanged(): void {
  publishRepoChangeEvent()
  scheduleCurrentWorktreeBaseDirectoryWatcherSync()
}
