import {
  getRepoExecutionHostId,
  getRepoIdFromWorktreeId,
  parseExecutionHostId,
  toSshExecutionHostId
} from '@yiru/workbench-model/workspace'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import { resolveLocalProjectRuntimeForRepo } from '~main/local-project-runtime-resolution'
import type { Store } from '~main/persistence'
import { normalizeGlobalWindowsRuntimeDefault } from '~shared/project-execution-runtime'
import type { CursorRateLimitRefreshContext } from '~shared/rate-limit-types'
import type { GlobalSettings, Repo } from '~shared/types'
import { parseWorkspaceKey } from '~shared/workspace/scope'

export type CursorHostRuntimeTarget =
  | { runtime: 'host' }
  | { runtime: 'wsl'; wslDistro: string | null }

export type CursorUsageRuntimeTarget =
  | CursorHostRuntimeTarget
  | { runtime: 'ssh'; connectionId: string }
  | { runtime: 'environment'; environmentId: string }

function getWorktreeId(workspaceId: string | null): string | null {
  if (!workspaceId) {
    return null
  }
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    return null
  }
  return scope?.type === 'worktree' ? scope.worktreeId : workspaceId
}

function getRepoForWorkspace(store: Store, workspaceId: string | null): Repo | null {
  const worktreeId = getWorktreeId(workspaceId)
  if (!worktreeId) {
    return null
  }
  return store.getRepo(getRepoIdFromWorktreeId(worktreeId)) ?? null
}

function getFolderWorkspaceHost(store: Store, workspaceId: string): ExecutionHostId | null {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type !== 'folder') {
    return null
  }
  const workspace = store.getFolderWorkspace(scope.folderWorkspaceId)
  const group = workspace
    ? store.getProjectGroups().find((entry) => entry.id === workspace.projectGroupId)
    : null
  const explicitHost = parseExecutionHostId(group?.executionHostId)
  if (explicitHost) {
    return explicitHost.id
  }
  const connectionId = workspace?.connectionId?.trim() || group?.connectionId?.trim()
  return connectionId ? toSshExecutionHostId(connectionId) : null
}

function getWorkspaceExecutionHost(
  store: Store,
  workspaceId: string | null,
  activeRepoId: string | null
): ExecutionHostId {
  if (workspaceId) {
    const folderHost = getFolderWorkspaceHost(store, workspaceId)
    if (folderHost) {
      return folderHost
    }
    const worktreeId = getWorktreeId(workspaceId)
    const worktreeHost = parseExecutionHostId(
      worktreeId ? store.getWorktreeMeta(worktreeId)?.hostId : null
    )
    if (worktreeHost) {
      return worktreeHost.id
    }
    const repo = getRepoForWorkspace(store, workspaceId)
    if (repo?.executionHostId?.trim() || repo?.connectionId?.trim()) {
      return getRepoExecutionHostId(repo)
    }
  }

  const activeRepo = activeRepoId ? store.getRepo(activeRepoId) : null
  if (activeRepo?.executionHostId?.trim() || activeRepo?.connectionId?.trim()) {
    return getRepoExecutionHostId(activeRepo)
  }
  const environmentId = store.getSettings().activeRuntimeEnvironmentId?.trim()
  return environmentId ? `runtime:${encodeURIComponent(environmentId)}` : 'local'
}

function getFallbackContext(store: Store): CursorRateLimitRefreshContext {
  const session = store.getWorkspaceSession()
  const workspaceId = session.activeWorkspaceKey ?? session.activeWorktreeId
  return {
    executionHostId: getWorkspaceExecutionHost(store, workspaceId, session.activeRepoId),
    workspaceId
  }
}

function getLocalTarget(
  store: Store,
  settings: GlobalSettings,
  platform: NodeJS.Platform,
  workspaceId: string | null
): CursorHostRuntimeTarget {
  const activeRepo = getRepoForWorkspace(store, workspaceId)
  const projectRuntime = activeRepo
    ? resolveLocalProjectRuntimeForRepo(store, activeRepo)
    : undefined
  if (projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl') {
    return { runtime: 'wsl', wslDistro: projectRuntime.runtime.distro }
  }
  if (platform !== 'win32') {
    return { runtime: 'host' }
  }
  const defaultRuntime = normalizeGlobalWindowsRuntimeDefault(settings.localWindowsRuntimeDefault)
  return defaultRuntime.kind === 'wsl'
    ? { runtime: 'wsl', wslDistro: defaultRuntime.distro }
    : { runtime: 'host' }
}

export function resolveCursorUsageRuntimeTarget(
  store: Store,
  context: CursorRateLimitRefreshContext | null,
  platform: NodeJS.Platform
): CursorUsageRuntimeTarget {
  const resolvedContext = context ?? getFallbackContext(store)
  const executionHost = parseExecutionHostId(resolvedContext.executionHostId)
  if (executionHost?.kind === 'ssh') {
    return { runtime: 'ssh', connectionId: executionHost.targetId }
  }
  if (executionHost?.kind === 'runtime') {
    return { runtime: 'environment', environmentId: executionHost.environmentId }
  }
  return getLocalTarget(store, store.getSettings(), platform, resolvedContext.workspaceId)
}
