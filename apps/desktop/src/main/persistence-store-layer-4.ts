import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import { normalizeRepoSourceControlAiOverrides } from '~shared/source-control/ai'
import type {
  ProjectHostSetup,
  ProjectHostSetupUpdateArgs,
  Repo,
  WorkspaceKey
} from '~shared/types'
import { parseWorkspaceKey } from '~shared/workspace/scope'
import { isLegacyRepoForExternalWorktreeVisibility } from '~shared/workspace/worktree-ownership'

import { removeRepoFromWorkspaceSessionsForHost } from './persisted-state/workspace-session-owner-removal'
import { mergeProjectHostSetupCompatibilityState } from './persistence-compatibility'
import { sanitizeRepoUpdatesForPersistence } from './persistence-repo-sanitization'
import { StoreLayer3 } from './persistence-store-layer-3'

export abstract class StoreLayer4 extends StoreLayer3 {
  // Clean up worktree meta, lineage, and workspace lineage for a repo id.
  // When hostId is null, prune all of the repo's entries; when a hostId is
  // given, prune only entries whose meta.hostId resolves to that host (a
  // missing hostId is treated as local).
  protected pruneWorktreeStateForRepo(id: string, hostId: ExecutionHostId | null): void {
    const prefix = `${id}::`
    // Why: owner ids do not encode their execution host, so only the selected
    // host partition may be pruned while another host still owns the repo id.
    const sessions = removeRepoFromWorkspaceSessionsForHost({
      workspaceSession: this.state.workspaceSession,
      workspaceSessionsByHostId: this.state.workspaceSessionsByHostId,
      repoId: id,
      hostId
    })
    this.state.workspaceSession = sessions.workspaceSession
    this.state.workspaceSessionsByHostId = sessions.workspaceSessionsByHostId
    // Why: snapshot host membership up front. Lineage pruning below checks the
    // meta.hostId of worktree keys that may already have been deleted from
    // worktreeMeta in the first loop, so reading hostId live would misclassify
    // an SSH worktree as local once its meta is gone.
    const hostMembership = new Map<string, boolean>()
    const belongsToHost = (key: string): boolean => {
      if (!key.startsWith(prefix)) {
        return false
      }
      if (hostId === null) {
        return true
      }
      const cached = hostMembership.get(key)
      if (cached !== undefined) {
        return cached
      }
      // Why default to local: worktree metas created on/after host-ownership
      // stamping carry hostId. A metas without it predates that and is treated as
      // local, so a host-scoped (non-local) prune conservatively leaves it — it
      // may leak a stale entry for a legacy SSH worktree sharing a repo id with a
      // local repo, but it never deletes the wrong host's live meta.
      const metaHostId = this.state.worktreeMeta[key]?.hostId ?? LOCAL_EXECUTION_HOST_ID
      const result = metaHostId === hostId
      hostMembership.set(key, result)
      return result
    }
    for (const key of Object.keys(this.state.worktreeMeta)) {
      if (belongsToHost(key)) {
        delete this.state.worktreeMeta[key]
      }
    }
    for (const [childId, lineage] of Object.entries(this.state.worktreeLineageById)) {
      if (belongsToHost(childId) || belongsToHost(lineage.parentWorktreeId)) {
        delete this.state.worktreeLineageById[childId]
      }
    }
    for (const [childKey, lineage] of Object.entries(this.state.workspaceLineageByChildKey)) {
      const childScope = parseWorkspaceKey(childKey)
      const parentScope = parseWorkspaceKey(lineage.parentWorkspaceKey)
      if (childScope?.type === 'worktree' && belongsToHost(childScope.worktreeId)) {
        delete this.state.workspaceLineageByChildKey[childKey as WorkspaceKey]
        continue
      }
      if (parentScope?.type === 'worktree' && belongsToHost(parentScope.worktreeId)) {
        delete this.state.workspaceLineageByChildKey[childKey as WorkspaceKey]
      }
    }
  }

  updateRepo(
    id: string,
    updates: Partial<
      Pick<
        Repo,
        | 'displayName'
        | 'badgeColor'
        | 'repoIcon'
        | 'upstream'
        | 'gitRemoteIdentity'
        | 'hookSettings'
        | 'worktreeBaseRef'
        | 'worktreeBasePath'
        | 'kind'
        | 'executionHostId'
        | 'symlinkPaths'
        | 'forgeRemotePreference'
        | 'forkSyncMode'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
        | 'projectHostSetupMethod'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  ): Repo | null {
    const repo = this.state.repos.find((r) => r.id === id)
    if (!repo) {
      return null
    }
    const sanitizedUpdates = sanitizeRepoUpdatesForPersistence(updates)
    if ('projectGroupId' in sanitizedUpdates) {
      const nextGroupId = sanitizedUpdates.projectGroupId
      if (
        typeof nextGroupId !== 'string' ||
        nextGroupId.trim().length === 0 ||
        !this.state.projectGroups.some((group) => group.id === nextGroupId)
      ) {
        sanitizedUpdates.projectGroupId = null
      }
    }
    if (
      'projectGroupOrder' in sanitizedUpdates &&
      (typeof sanitizedUpdates.projectGroupOrder !== 'number' ||
        !Number.isFinite(sanitizedUpdates.projectGroupOrder))
    ) {
      delete sanitizedUpdates.projectGroupOrder
    }
    const externalWorktreeVisibilityLegacy =
      'externalWorktreeVisibility' in sanitizedUpdates &&
      repo.externalWorktreeVisibilityLegacy === undefined
        ? isLegacyRepoForExternalWorktreeVisibility(repo)
        : undefined
    // Why: selected repo fields use `undefined` as an explicit clear signal,
    // so delete them before assigning the rest of the patch.
    if (
      'forgeRemotePreference' in sanitizedUpdates &&
      sanitizedUpdates.forgeRemotePreference === undefined
    ) {
      delete repo.forgeRemotePreference
      delete sanitizedUpdates.forgeRemotePreference
    }
    if ('worktreeBasePath' in sanitizedUpdates && sanitizedUpdates.worktreeBasePath === undefined) {
      delete repo.worktreeBasePath
      delete sanitizedUpdates.worktreeBasePath
    }
    if (
      'externalWorktreeVisibility' in sanitizedUpdates &&
      repo.externalWorktreeVisibilityLegacy === undefined
    ) {
      // Why: old persisted repos have no explicit marker. Stamp it the first
      // time visibility changes so later hide/show choices keep legacy safety.
      repo.externalWorktreeVisibilityLegacy = externalWorktreeVisibilityLegacy
    }
    if (
      'externalWorktreeDiscoverySuppressedAt' in sanitizedUpdates &&
      (sanitizedUpdates.externalWorktreeDiscoverySuppressedAt === undefined ||
        sanitizedUpdates.externalWorktreeDiscoverySuppressedAt === null)
    ) {
      delete repo.externalWorktreeDiscoverySuppressedAt
      delete sanitizedUpdates.externalWorktreeDiscoverySuppressedAt
    }
    if (
      'sourceControlAi' in sanitizedUpdates &&
      (sanitizedUpdates.sourceControlAi === undefined || sanitizedUpdates.sourceControlAi === null)
    ) {
      delete repo.sourceControlAi
      delete sanitizedUpdates.sourceControlAi
    } else if ('sourceControlAi' in sanitizedUpdates) {
      const normalizedSourceControlAi = normalizeRepoSourceControlAiOverrides(
        sanitizedUpdates.sourceControlAi
      )
      if (normalizedSourceControlAi === undefined) {
        delete sanitizedUpdates.sourceControlAi
      } else {
        sanitizedUpdates.sourceControlAi = normalizedSourceControlAi
      }
    }
    Object.assign(repo, sanitizedUpdates)
    this.syncProjectHostSetupCompatibilityState()
    this.scheduleSave()
    return this.hydrateRepo(repo)
  }

  protected syncProjectHostSetupCompatibilityState(): void {
    const compatibilityState = mergeProjectHostSetupCompatibilityState(this.state, this.state.repos)
    this.state.projects = compatibilityState.projects
    this.state.projectHostSetups = compatibilityState.projectHostSetups
  }

  protected updateRepoBackedProjectHostSetup(
    setup: ProjectHostSetup,
    repo: Repo,
    updates: ProjectHostSetupUpdateArgs['updates']
  ): { setup: ProjectHostSetup; repo: Repo } | null {
    if (updates.path !== undefined && updates.path !== repo.path) {
      throw new Error(
        'Repo-backed project host setup paths must be changed by re-importing the project.'
      )
    }
    if (updates.setupState !== undefined && updates.setupState !== 'ready') {
      throw new Error('Repo-backed project host setups cannot be marked unavailable.')
    }
    const repoUpdates: Parameters<StoreLayer3['updateRepo']>[1] = {}
    if (updates.displayName !== undefined) {
      repoUpdates.displayName = updates.displayName
    }
    if (updates.worktreeBasePath !== undefined) {
      repoUpdates.worktreeBasePath = updates.worktreeBasePath
    }
    if (updates.kind !== undefined) {
      repoUpdates.kind = updates.kind
    }
    if (updates.setupMethod === 'provisioned') {
      throw new Error('Repo-backed project host setups cannot be marked provisioned.')
    }
    if (updates.setupMethod !== undefined && updates.setupMethod !== 'legacy-repo') {
      repoUpdates.projectHostSetupMethod = updates.setupMethod
    }
    const updatedRepo =
      Object.keys(repoUpdates).length > 0 ? this.updateRepo(repo.id, repoUpdates) : repo
    if (!updatedRepo) {
      return null
    }
    return {
      setup: this.state.projectHostSetups.find((entry) => entry.id === setup.id) ?? setup,
      repo: updatedRepo
    }
  }
}
