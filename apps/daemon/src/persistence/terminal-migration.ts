import { isPathInsideOrEqual } from '@yiru/runtime-protocol/model/platform'
import { getProjectGroupSubtreeIds } from '@yiru/runtime-protocol/workbench/project-groups'
import type {
  PersistedState,
  Repo,
  ProjectGroup,
  TerminalTab,
  WorkspaceSessionState
} from '@yiru/runtime-protocol/workbench/types'
import {
  collectTerminalScrollbackSnapshotRefs,
  deleteTerminalScrollbackSnapshotSync,
  type TerminalScrollbackSnapshotStorage
} from '~main/terminal/scrollback-snapshots'

export function createMinimalPersistedTerminalTab(args: {
  worktreeId: string
  worktreeInstanceId?: string | null
  tabId: string
  ptyId: string
  existingTabCount: number
  startupCwd?: string
}): TerminalTab {
  const ordinal = args.existingTabCount + 1
  const defaultTitle = `Terminal ${ordinal}`
  return {
    id: args.tabId,
    ptyId: args.ptyId,
    worktreeId: args.worktreeId,
    ...(args.worktreeInstanceId ? { worktreeInstanceId: args.worktreeInstanceId } : {}),
    title: defaultTitle,
    defaultTitle,
    customTitle: null,
    color: null,
    sortOrder: args.existingTabCount,
    createdAt: Date.now(),
    ...(args.startupCwd ? { startupCwd: args.startupCwd } : {}),
    pendingActivationSpawn: true
  }
}

export function inferFolderScopeConnectionIdForMigration(args: {
  folderPath: string
  projectGroupId: string
  projectGroups: readonly ProjectGroup[]
  repos: readonly Repo[]
}): string | null {
  const groupIds = getProjectGroupSubtreeIds(args.projectGroups, args.projectGroupId)
  const groupRepos = args.repos.filter(
    (repo) => typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)
  )
  const candidateRepos =
    groupRepos.length > 0
      ? groupRepos
      : args.repos.filter((repo) => isPathInsideOrEqual(args.folderPath, repo.path))
  if (candidateRepos.length === 0) {
    return null
  }
  let hasLocalRepo = false
  const connectionIds = new Set<string>()
  for (const repo of candidateRepos) {
    if (repo.connectionId) {
      connectionIds.add(repo.connectionId)
    } else {
      hasLocalRepo = true
    }
  }
  if (hasLocalRepo || connectionIds.size !== 1) {
    return null
  }
  return [...connectionIds][0]
}

export function backfillFolderScopeConnectionIds(state: PersistedState): {
  state: PersistedState
  changed: boolean
} {
  const groups = state.projectGroups ?? []
  const repos = state.repos ?? []
  let changed = false
  const projectGroups = groups.map((group) => {
    if (group.connectionId || !group.parentPath) {
      return group
    }
    const connectionId = inferFolderScopeConnectionIdForMigration({
      folderPath: group.parentPath,
      projectGroupId: group.id,
      projectGroups: groups,
      repos
    })
    if (!connectionId) {
      return group
    }
    changed = true
    return { ...group, connectionId }
  })
  const groupsById = new Map(projectGroups.map((group) => [group.id, group]))
  const folderWorkspaces = (state.folderWorkspaces ?? []).map((workspace) => {
    if (workspace.connectionId) {
      return workspace
    }
    const groupConnectionId = groupsById.get(workspace.projectGroupId)?.connectionId ?? null
    const connectionId =
      groupConnectionId ??
      inferFolderScopeConnectionIdForMigration({
        folderPath: workspace.folderPath,
        projectGroupId: workspace.projectGroupId,
        projectGroups,
        repos
      })
    if (!connectionId) {
      return workspace
    }
    changed = true
    return { ...workspace, connectionId }
  })
  return {
    changed,
    state: changed ? { ...state, projectGroups, folderWorkspaces } : state
  }
}

export function deleteRemovedTerminalScrollbackSnapshots(
  prior: WorkspaceSessionState | undefined,
  next: WorkspaceSessionState,
  storage?: TerminalScrollbackSnapshotStorage
): void {
  if (!prior) {
    return
  }
  const nextRefs = collectTerminalScrollbackSnapshotRefs(next)
  for (const ref of collectTerminalScrollbackSnapshotRefs(prior)) {
    if (!nextRefs.has(ref)) {
      deleteTerminalScrollbackSnapshotSync(ref, storage)
    }
  }
}
