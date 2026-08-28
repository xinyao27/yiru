import {
  getRepoExecutionHostId,
  getRepoIdFromWorktreeId,
  parseExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import { normalizeGlobalWindowsRuntimeDefault } from '@yiru/runtime-protocol/workbench/project-execution-runtime'
import type { CursorRateLimitRefreshContext } from '@yiru/runtime-protocol/workbench/rate-limit-types'
import type { GlobalSettings, Repo } from '@yiru/runtime-protocol/workbench/types'
import { parseWorkspaceKey } from '@yiru/runtime-protocol/workbench/workspace/scope'
import { resolveLocalProjectRuntimeForRepo } from '~main/local-project-runtime-resolution'
import type { Store } from '~main/persistence/store'

export type CursorHostRuntimeTarget =
  | { runtime: 'host' }
  | { runtime: 'wsl'; wslDistro: string | null }

export type CursorUsageRuntimeTarget =
  | CursorHostRuntimeTarget
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
  return explicitHost ? explicitHost.id : null
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
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — only executionHostId can still make a repo non-local.
    const repo = getRepoForWorkspace(store, workspaceId)
    if (repo?.executionHostId?.trim()) {
      return getRepoExecutionHostId(repo)
    }
  }

  const activeRepo = activeRepoId ? store.getRepo(activeRepoId) : null
  if (activeRepo?.executionHostId?.trim()) {
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
  if (executionHost?.kind === 'runtime') {
    return { runtime: 'environment', environmentId: executionHost.environmentId }
  }
  return getLocalTarget(store, store.getSettings(), platform, resolvedContext.workspaceId)
}
