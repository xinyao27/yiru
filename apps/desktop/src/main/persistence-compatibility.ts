import type { MigrationUnsupportedPtyEntry } from '@yiru/workbench-model/agent'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import { projectHostSetupProjectionFromRepos } from '~shared/project-host-setup-projection'
import { parseLegacyNumericPaneKey } from '~shared/stable-pane-id'
import type { PersistedState, ProjectHostSetup, Repo, LegacyPaneKeyAliasEntry } from '~shared/types'

import { agentHookServer } from './agent-hooks/server'
import { normalizePersistedLegacyPaneKeyAliasEntries as normalizeLegacyPaneKeyAliasEntries } from './persisted-state/persisted-terminal-session-codec'

export function registerPersistedPaneKeyAlias(entry: LegacyPaneKeyAliasEntry): void {
  if (parseLegacyNumericPaneKey(entry.legacyPaneKey)) {
    agentHookServer.registerPaneKeyAlias(
      entry.legacyPaneKey,
      entry.stablePaneKey,
      entry.ptyId,
      entry.updatedAt,
      { overwriteExisting: false }
    )
    return
  }
  // Why: detached agents keep their original UUID pane key across restarts;
  // restore the physical-to-current-owner mapping before hook replay begins.
  agentHookServer.transferPaneAuthority(
    entry.legacyPaneKey,
    entry.stablePaneKey,
    entry.ptyId,
    entry.updatedAt,
    { authorityVerified: false }
  )
}

export function mergeLegacyPaneKeyAliasEntries(
  entries: LegacyPaneKeyAliasEntry[]
): LegacyPaneKeyAliasEntry[] {
  const byLegacyPaneKey = new Map<string, LegacyPaneKeyAliasEntry>()
  for (const entry of normalizeLegacyPaneKeyAliasEntries(entries)) {
    const existing = byLegacyPaneKey.get(entry.legacyPaneKey)
    if (!existing || existing.updatedAt <= entry.updatedAt) {
      byLegacyPaneKey.set(entry.legacyPaneKey, entry)
    }
  }
  return [...byLegacyPaneKey.values()]
}

export function legacyPaneKeyAliasEntriesEqual(
  left: LegacyPaneKeyAliasEntry[],
  right: LegacyPaneKeyAliasEntry[]
): boolean {
  if (left.length !== right.length) {
    return false
  }
  const rightByLegacyPaneKey = new Map(right.map((entry) => [entry.legacyPaneKey, entry]))
  return left.every((entry) => {
    const other = rightByLegacyPaneKey.get(entry.legacyPaneKey)
    return other ? JSON.stringify(entry) === JSON.stringify(other) : false
  })
}

export function migrationUnsupportedEntriesEqual(
  left: MigrationUnsupportedPtyEntry[],
  right: MigrationUnsupportedPtyEntry[]
): boolean {
  if (left.length !== right.length) {
    return false
  }
  const rightByPtyId = new Map(right.map((entry) => [entry.ptyId, entry]))
  return left.every((entry) => {
    const other = rightByPtyId.get(entry.ptyId)
    return other ? JSON.stringify(entry) === JSON.stringify(other) : false
  })
}

export function projectHostSetupCompatibilityStateEqual(
  state: Pick<PersistedState, 'projects' | 'projectHostSetups'>,
  nextState: Pick<PersistedState, 'projects' | 'projectHostSetups'>
): boolean {
  return (
    JSON.stringify(state.projects ?? []) === JSON.stringify(nextState.projects) &&
    JSON.stringify(state.projectHostSetups ?? []) === JSON.stringify(nextState.projectHostSetups)
  )
}

export function isRepoBackedProjectHostSetup(
  setup: ProjectHostSetup,
  currentRepoIds: ReadonlySet<string>
): boolean {
  const repoId = typeof setup.repoId === 'string' ? setup.repoId : ''
  return repoId.length > 0 && (currentRepoIds.has(repoId) || setup.id === repoId)
}

export function mergeProjectHostSetupCompatibilityState(
  state: Pick<PersistedState, 'projects' | 'projectHostSetups'>,
  repos: readonly Repo[]
): Pick<PersistedState, 'projects' | 'projectHostSetups'> {
  const projection = projectHostSetupProjectionFromRepos(repos)
  const existingProjectsById = new Map(
    (state.projects ?? []).map((project) => [project.id, project])
  )
  const currentRepoIds = new Set(repos.map((repo) => repo.id))
  const projectedProjectIds = new Set(projection.projects.map((project) => project.id))
  const projectedSetupIds = new Set(projection.setups.map((setup) => setup.id))
  // Why: legacy/repo-backed setup rows use the repo id as the setup id. Keep
  // only independent setup rows here so repo deletion does not leave ghosts.
  const independentSetups = (state.projectHostSetups ?? []).filter((setup) => {
    if (projectedSetupIds.has(setup.id)) {
      return false
    }
    return !isRepoBackedProjectHostSetup(setup, currentRepoIds)
  })
  const independentProjectIds = new Set(independentSetups.map((setup) => setup.projectId))
  const independentProjects = (state.projects ?? [])
    .filter(
      (project) => independentProjectIds.has(project.id) && !projectedProjectIds.has(project.id)
    )
    .map((project) => ({
      ...project,
      sourceRepoIds: project.sourceRepoIds.filter((repoId) => currentRepoIds.has(repoId))
    }))
  const projectedProjects = projection.projects.map((project) => {
    const existingProject = existingProjectsById.get(project.id)
    return existingProject?.localWindowsRuntimePreference
      ? {
          ...project,
          localWindowsRuntimePreference: existingProject.localWindowsRuntimePreference,
          updatedAt: Math.max(project.updatedAt, existingProject.updatedAt)
        }
      : project
  })
  return {
    projects: [...projectedProjects, ...independentProjects],
    projectHostSetups: [...projection.setups, ...independentSetups]
  }
}

export function makeProjectHostSetupId(
  projectId: string,
  hostId: ExecutionHostId,
  existingIds: ReadonlySet<string>,
  requestedId?: string
): string {
  const baseId = requestedId?.trim() || `${projectId}::${hostId}`
  if (!existingIds.has(baseId)) {
    return baseId
  }
  let suffix = 2
  let candidate = `${baseId}::${suffix}`
  while (existingIds.has(candidate)) {
    suffix++
    candidate = `${baseId}::${suffix}`
  }
  return candidate
}
