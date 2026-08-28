import { resolve } from 'node:path'

import { isPathInsideOrEqual } from '@yiru/runtime-protocol/model/platform'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import { getProjectGroupSubtreeIds } from '@yiru/runtime-protocol/workbench/project-groups'
import type { ProjectGroup, Repo } from '@yiru/runtime-protocol/workbench/types'

import type { Store } from '../persistence/store'
import { computeWorkspaceRoot, getWorktreePathSettings } from '../worktree/logic'

type FolderScopeStore = Pick<Store, 'getRepos'> &
  Partial<Pick<Store, 'getProjectGroups' | 'getFolderWorkspaces'>>

export function getLocalRepos(store: Store): Repo[] {
  // Why: paired-runtime paths are meaningful on their owning host. Treating
  // them as local roots could authorize unrelated local folders.
  return store.getRepos().filter((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
}

function getFolderScopeCandidateRepos(
  folderPath: string,
  projectGroupId: string,
  projectGroups: readonly ProjectGroup[],
  repos: readonly Repo[]
): Repo[] {
  const groupIds = getProjectGroupSubtreeIds(projectGroups, projectGroupId)
  return repos.filter(
    (repo) =>
      (typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)) ||
      isPathInsideOrEqual(folderPath, repo.path)
  )
}

function isLocalFolderScope(
  folderPath: string,
  projectGroupId: string,
  projectGroups: readonly ProjectGroup[],
  repos: readonly Repo[]
): boolean {
  const groupHostId = normalizeExecutionHostId(
    projectGroups.find((group) => group.id === projectGroupId)?.executionHostId
  )
  if (groupHostId) {
    return groupHostId === LOCAL_EXECUTION_HOST_ID
  }
  const candidates = getFolderScopeCandidateRepos(folderPath, projectGroupId, projectGroups, repos)
  return (
    candidates.length === 0 ||
    candidates.some((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
  )
}

function getLocalFolderScopeRoots(store: Store): string[] {
  const scopeStore = store as FolderScopeStore
  const repos = scopeStore.getRepos()
  // Why: narrow Store adapters may omit folder scopes; those roots are additive.
  const projectGroups = scopeStore.getProjectGroups?.() ?? []
  const roots: string[] = []
  for (const group of projectGroups) {
    if (group.parentPath && isLocalFolderScope(group.parentPath, group.id, projectGroups, repos)) {
      roots.push(resolve(group.parentPath))
    }
  }
  for (const workspace of scopeStore.getFolderWorkspaces?.() ?? []) {
    if (isLocalFolderScope(workspace.folderPath, workspace.projectGroupId, projectGroups, repos)) {
      roots.push(resolve(workspace.folderPath))
    }
  }
  return roots
}

export function getAllowedRoots(store: Store): string[] {
  const localRepos = getLocalRepos(store)
  const settings = store.getSettings()
  const roots = [
    ...localRepos.map((repo) => resolve(repo.path)),
    ...getLocalFolderScopeRoots(store)
  ]
  if (settings.workspaceDir) {
    if (localRepos.length === 0) {
      roots.push(resolve(settings.workspaceDir))
    } else {
      for (const repo of localRepos) {
        roots.push(
          resolve(computeWorkspaceRoot(repo.path, getWorktreePathSettings(repo, settings)))
        )
      }
    }
  }
  return roots
}
