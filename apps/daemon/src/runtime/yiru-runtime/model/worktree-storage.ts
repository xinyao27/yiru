import { randomUUID } from 'node:crypto'

import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import { FOLDER_WORKSPACE_INSTANCE_SEPARATOR } from '@yiru/runtime-protocol/model/workspace'
import type {
  GitPushTarget,
  Repo,
  RemoveWorktreeResult,
  Worktree,
  WorktreeMeta
} from '@yiru/runtime-protocol/workbench/types'
import { DEFAULT_WORKSPACE_STATUS_ID } from '@yiru/runtime-protocol/workbench/workspace/statuses'
import { gitExecFileAsync } from '~main/git/runner/runner'
import type { Store } from '~main/persistence/store'
import { getLocalWorktreePathAccess, toLocalWorktreeRuntimePath } from '~main/worktree/filesystem'
import { isWorktreePathMissing } from '~main/worktree/removal-safety'

import type { RuntimeStore } from './runtime-store'

export function omitUndefinedProperties<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>
}

export async function isRuntimeWorktreePathMissing(
  worktreePath: string,
  localWorktreeGitOptions: { wslDistro?: string } = {}
): Promise<boolean> {
  const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
  return isWorktreePathMissing(
    toLocalWorktreeRuntimePath(worktreePath, localWorktreeGitOptions),
    access.statPath
  )
}

export async function isLocalRuntimeGitRepository(
  runtimeWorktreePath: string,
  localWorktreeGitOptions: { wslDistro?: string } = {}
): Promise<boolean> {
  try {
    await gitExecFileAsync(['status', '--short'], {
      cwd: runtimeWorktreePath,
      ...localWorktreeGitOptions
    })
    return true
  } catch (error) {
    return !gitStatusErrorMeansNotRepository(error)
  }
}

export function gitStatusErrorMeansNotRepository(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : typeof error === 'string'
          ? error
          : ''
  const stderr =
    error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr)
      : ''
  return /not a git repository/i.test(`${message}\n${stderr}`)
}

export type RuntimeWorktreeRemovalTarget = {
  id: string
  repoId: string
  path: string
  pushTarget?: GitPushTarget
}

export type RuntimeWorktreeRemovalInFlight = {
  optionsKey: string
  promise: Promise<RemoveWorktreeResult & { warning?: string }>
}

export type PreservedBranchCleanupTarget = {
  branchName: string
  head: string
  pushTarget?: GitPushTarget
}

export function getRuntimeWorktreeRemovalOptionsKey(force: boolean, runHooks: boolean): string {
  return `${force ? 'force' : 'normal'}:${runHooks ? 'run-hooks' : 'skip-hooks'}`
}

export function getRuntimeFolderWorkspaceRootId(repo: Repo): string {
  return `${repo.id}::${repo.path}`
}

// Why: an omitted host means the local execution host. An explicit runtime may
// still adopt one legacy unstamped repo whose host identity was lost during import.
export function runtimeRepoMatchesExecutionHost(
  repo: Pick<Repo, 'executionHostId'>,
  executionHostId?: ExecutionHostId | null
): boolean {
  const requestedHostId = executionHostId ?? LOCAL_EXECUTION_HOST_ID
  if (repo.executionHostId != null) {
    return getRepoExecutionHostId(repo) === requestedHostId
  }
  return true
}

export function findLocalRepoById(
  store: Pick<Store, 'getRepos'>,
  repoId: string
): Repo | undefined {
  return store
    .getRepos()
    .find((repo) => repo.id === repoId && getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
}

export function getRuntimeFolderWorkspaceInstanceId(repo: Repo, instanceId: string): string {
  return `${getRuntimeFolderWorkspaceRootId(repo)}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}${instanceId}`
}

export function getRuntimeFolderWorkspaceInstanceIdentity(repo: Repo, worktreeId: string): string {
  const prefix = `${getRuntimeFolderWorkspaceRootId(repo)}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}`
  return worktreeId.startsWith(prefix) ? worktreeId.slice(prefix.length) : randomUUID()
}

export function isRuntimeFolderWorkspaceIdForRepo(repo: Repo, worktreeId: string): boolean {
  const rootId = getRuntimeFolderWorkspaceRootId(repo)
  return (
    worktreeId === rootId ||
    worktreeId.startsWith(`${rootId}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}`)
  )
}

export function mergeRuntimeFolderWorkspace(
  repo: Repo,
  worktreeId: string,
  meta: WorktreeMeta
): Worktree {
  return {
    id: worktreeId,
    ...(meta.instanceId !== undefined ? { instanceId: meta.instanceId } : {}),
    repoId: repo.id,
    ...(meta.projectId !== undefined ? { projectId: meta.projectId } : {}),
    ...(meta.hostId !== undefined ? { hostId: meta.hostId } : {}),
    ...(meta.projectHostSetupId !== undefined
      ? { projectHostSetupId: meta.projectHostSetupId }
      : {}),
    path: repo.path,
    head: '',
    branch: '',
    isBare: false,
    isMainWorktree: worktreeId === getRuntimeFolderWorkspaceRootId(repo),
    displayName: meta.displayName || repo.displayName,
    comment: meta.comment || '',
    linkedPR: meta.linkedPR ?? null,
    linkedGitLabMR: meta.linkedGitLabMR ?? null,
    linkedBitbucketPR: meta.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: meta.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: meta.linkedGiteaPR ?? null,
    isArchived: meta.isArchived ?? false,
    isUnread: meta.isUnread ?? false,
    isPinned: meta.isPinned ?? false,
    sortOrder: meta.sortOrder ?? 0,
    ...(meta.manualOrder !== undefined ? { manualOrder: meta.manualOrder } : {}),
    lastActivityAt: meta.lastActivityAt ?? 0,
    ...(meta.createdAt !== undefined ? { createdAt: meta.createdAt } : {}),
    ...(meta.createdWithAgent !== undefined ? { createdWithAgent: meta.createdWithAgent } : {}),
    ...(meta.priorWorktreeIds !== undefined ? { priorWorktreeIds: meta.priorWorktreeIds } : {}),
    workspaceStatus: meta.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
    diffComments: meta.diffComments,
    mobileDiffReview: meta.mobileDiffReview
  }
}

export function listRuntimeFolderWorkspaces(
  store: Pick<RuntimeStore, 'getAllWorktreeMeta' | 'setWorktreeMeta'>,
  repo: Repo
): Worktree[] {
  const rootId = getRuntimeFolderWorkspaceRootId(repo)
  const allMeta = store.getAllWorktreeMeta()
  const ids = Object.keys(allMeta).filter((worktreeId) =>
    isRuntimeFolderWorkspaceIdForRepo(repo, worktreeId)
  )
  if (!ids.includes(rootId)) {
    ids.unshift(rootId)
  } else {
    ids.sort((left, right) => {
      if (left === rootId) {
        return -1
      }
      if (right === rootId) {
        return 1
      }
      return 0
    })
  }

  return ids.map((worktreeId) => {
    const existing = allMeta[worktreeId]
    const meta = existing?.instanceId
      ? existing
      : store.setWorktreeMeta(worktreeId, {
          instanceId: getRuntimeFolderWorkspaceInstanceIdentity(repo, worktreeId),
          ...(existing ? {} : { displayName: repo.displayName, lastActivityAt: Date.now() })
        })
    return mergeRuntimeFolderWorkspace(repo, worktreeId, meta)
  })
}
