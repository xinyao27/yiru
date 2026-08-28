import { homedir } from 'node:os'
import { join } from 'node:path'

import { normalizeExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import type { WorkspaceEventLog } from '../events/log'
import { invalidateAuthorizedRootsCache } from '../filesystem/auth'
import type { Store } from '../persistence/store'
import { withRevisionConflict } from '../rpc/revision-conflict'
import { scheduleCurrentWorktreeBaseDirectoryWatcherSync } from '../worktree/base-directory-watcher'
import type { NativeDirectoryPicker } from './native-directory-picker'
import { publishRepoChangeEvent } from './repo-events'

function getDefaultCreateProjectParent(): string {
  return join(homedir(), 'yiru', 'projects')
}

export function initializeShellRepoHostService(
  store: Store,
  runtime: YiruRuntimeService,
  directoryPicker: NativeDirectoryPicker,
  workspaceEventLog: WorkspaceEventLog
): void {
  shellRepoHostService = createShellRepoHostService(
    store,
    runtime,
    directoryPicker,
    workspaceEventLog
  )
}

type ShellRepoHostService = ReturnType<typeof createShellRepoHostService>

let shellRepoHostService: ShellRepoHostService | null = null

export function getShellRepoHostService(): ShellRepoHostService {
  if (!shellRepoHostService) {
    throw new Error('shell_repo_host_service_unavailable')
  }
  return shellRepoHostService
}

function createShellRepoHostService(
  store: Store,
  runtime: YiruRuntimeService,
  directoryPicker: NativeDirectoryPicker,
  workspaceEventLog: WorkspaceEventLog
) {
  const reorderForHost = async (args: {
    expectedRevision: number
    orderedIds: string[]
    hostId: string
  }): Promise<{ revision?: number; status: 'applied' | 'rejected' }> => {
    const hostId = normalizeExecutionHostId(args?.hostId)
    if (!hostId) {
      return { status: 'rejected' }
    }
    const ids = Array.isArray(args?.orderedIds) ? args.orderedIds : []
    return withRevisionConflict(() =>
      workspaceEventLog.runAtRevision('project-catalog', args.expectedRevision, () => {
        const applied = store.reorderReposForHost(ids, hostId)
        if (!applied) {
          return {
            revision: workspaceEventLog.revision('project-catalog'),
            status: 'rejected' as const
          }
        }
        notifyReposChanged()
        const event = workspaceEventLog.append('project-catalog', 'project.reordered', {
          count: ids.length,
          hostId
        })
        return { revision: event.revision, status: 'applied' as const }
      })
    )
  }

  // Why: forget a project on a single execution host without disturbing the
  // same repo id on another paired runtime. Used when a host-scoped project is
  // forgotten without removing an equal repo id elsewhere.
  const removeForHost = async (args: {
    expectedRevision: number
    repoId: string
    hostId: string
  }): Promise<{ removed: true; revision: number }> => {
    const hostId = normalizeExecutionHostId(args.hostId)
    if (!hostId) {
      throw new Error(`Invalid host ID: ${args.hostId}`)
    }
    return withRevisionConflict(() =>
      workspaceEventLog.runAtRevision('project-catalog', args.expectedRevision, () => {
        store.removeProjectForHost(args.repoId, hostId)
        invalidateAuthorizedRootsCache()
        notifyReposChanged()
        const event = workspaceEventLog.append('project-catalog', 'project.removed', {
          hostId,
          projectId: args.repoId
        })
        return { removed: true, revision: event.revision }
      })
    )
  }

  // ── Sparse presets ─────────────────────────────────────────────
  // Why: presets are repo-scoped reusable directory lists used by the
  // new-workspace composer. Persisted via Store and broadcast back to the
  // renderer so any open composer reflects new/edited/deleted presets
  // immediately.

  const pickFolder = async (): Promise<string | null> => {
    const paths = await directoryPicker.pickDirectory()
    return paths[0] ?? null
  }

  const pickFolders = async (): Promise<string[]> => {
    return directoryPicker.pickDirectory({ multiple: true })
  }

  // Why: pickDirectory is a generic "choose a folder" picker, separate from
  // pickFolder which is specifically the "add project" flow. Clone needs a
  // destination directory that may not be a git repo yet.
  const pickDirectory = async (): Promise<string | null> => {
    const paths = await directoryPicker.pickDirectory()
    return paths[0] ?? null
  }

  return {
    getDefaultCreateProjectParent,
    reorderForHost,
    removeForHost,
    pickFolder,
    pickFolders,
    pickDirectory,
    cloneAbort: (): void => runtime.abortRepoClone()
  }
}

function notifyReposChanged(): void {
  publishRepoChangeEvent()
  scheduleCurrentWorktreeBaseDirectoryWatcherSync()
}
