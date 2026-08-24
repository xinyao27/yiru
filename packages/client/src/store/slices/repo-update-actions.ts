import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { notifyInstalledAgentSkillsChanged } from '~renderer/runtime/installed-agent-skill-discovery-state'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { getManualRepoOrder } from '~shared/manual-repo-order'
import type { Repo } from '~shared/types'

import type { AppState } from '../types'
import { mergeProjectCompatibilityForHostRepoChange } from './repo-catalog-merge'
import { mergeUpdatedProjectCompatibilityProject } from './repo-compatibility-model'
import {
  findRepoForHost,
  getRepoHostIdentityForParts,
  repoMatchesHostIdentity
} from './repo-host-identity'
import { settingsForRepoOwner } from './repo-path-status-model'
import { splitRepoReorderByHost } from './repo-reorder-host-split'
import {
  getProjectSetupRuntimeTarget,
  getProjectUpdateRuntimeTarget,
  repoWithFetchedOwner
} from './repo-target-model'
import {
  sanitizeRepoUpdate,
  getRepoUpdateChains,
  getRuntimeTargetHostId
} from './repo-update-model'
import type { RepoSlice } from './repos'

export function createRepoUpdateActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'updateProject' | 'updateRepo' | 'setActiveRepo' | 'reorderRepos'> {
  return {
    updateProject: async (projectId, updates) => {
      try {
        const target = getProjectUpdateRuntimeTarget(get(), projectId)
        const updatedProject = (
          await callRuntimeOrpc(
            target,
            (client) => client.project.update,
            { projectId, updates },
            { timeoutMs: 15_000 }
          )
        ).project
        if (!updatedProject) {
          return false
        }
        const runtimePreferenceChanged = 'localWindowsRuntimePreference' in updates
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? mergeUpdatedProjectCompatibilityProject(project, updatedProject, updates)
              : project
          ),
          folderWorkspacePathStatuses: {}
        }))
        if (runtimePreferenceChanged) {
          get().clearLocalDetectedAgents()
          notifyInstalledAgentSkillsChanged()
        }
        return true
      } catch (err) {
        console.error('Failed to update project:', err)
        return false
      }
    },
    updateRepo: async (projectId, updates, options) => {
      const updateRepoChains = getRepoUpdateChains(get)
      // Why: pass options.hostId so a duplicate repo id across hosts resolves to the
      // intended row instead of findRepoForHost's settings-focused fallback.
      const ownerRepo = findRepoForHost(get().repos, projectId, {
        settings: get().settings,
        hostId: options?.hostId
      })
      if (!ownerRepo) {
        return false
      }
      // Why: an explicit hostId is authoritative — treat it as an explicit host so
      // routing goes to that host's target (local IPC or its runtime RPC) rather
      // than the currently-focused runtime, which is the same-id/self-pair case.
      // Why: Repo.connectionId is dead — nothing sets it since remote hosts
      // were removed (#63) — only options.hostId/executionHostId can still
      // make a repo non-local.
      const ownerHasExplicitHost = Boolean(options?.hostId || ownerRepo.executionHostId?.trim())
      const explicitOwnerHostId = getRepoExecutionHostId(ownerRepo)
      const ownerTarget = ownerHasExplicitHost
        ? getProjectSetupRuntimeTarget(explicitOwnerHostId)
        : getActiveRuntimeTarget(settingsForRepoOwner(get(), projectId))
      const ownerHostId = ownerHasExplicitHost
        ? explicitOwnerHostId
        : getRuntimeTargetHostId(ownerTarget)
      const updateChainKey = getRepoHostIdentityForParts(projectId, ownerHostId)
      const applyRepoUpdate = async () => {
        try {
          const sanitizedUpdates = sanitizeRepoUpdate(updates)
          const target = ownerTarget
          const updatedRepo =
            target.kind === 'local'
              ? await workspaceHostClient.repos.update({
                  repoId: projectId,
                  updates: sanitizedUpdates
                })
              : (
                  await callRuntimeOrpc(
                    target,
                    (client) => client.repo.update,
                    { repo: projectId, updates: sanitizedUpdates },
                    { timeoutMs: 15_000 }
                  )
                ).repo
          set((s) => {
            const nextRepos = s.repos.map((r) => {
              const matchesOwner = ownerHasExplicitHost
                ? repoMatchesHostIdentity(r, projectId, ownerHostId)
                : repoMatchesHostIdentity(r, projectId, ownerHostId) || r === ownerRepo
              if (!matchesOwner) {
                return r
              }
              if (updatedRepo) {
                return repoWithFetchedOwner(updatedRepo, target)
              }
              let mergedRepo: Repo = r
              const {
                sourceControlAi,
                externalWorktreeDiscoverySuppressedAt,
                ...updatesWithoutClearSentinels
              } = sanitizedUpdates
              mergedRepo = { ...mergedRepo, ...updatesWithoutClearSentinels }
              if (sourceControlAi === null) {
                const { sourceControlAi: _sourceControlAi, ...repoWithoutSourceControlAi } =
                  mergedRepo
                mergedRepo = repoWithoutSourceControlAi
              } else if (sourceControlAi !== undefined) {
                mergedRepo = { ...mergedRepo, sourceControlAi }
              }
              if (externalWorktreeDiscoverySuppressedAt === null) {
                const {
                  externalWorktreeDiscoverySuppressedAt: _suppressedAt,
                  ...repoWithoutSuppression
                } = mergedRepo
                mergedRepo = repoWithoutSuppression
              } else if (externalWorktreeDiscoverySuppressedAt !== undefined) {
                mergedRepo = { ...mergedRepo, externalWorktreeDiscoverySuppressedAt }
              }
              return mergedRepo
            })
            return {
              repos: nextRepos,
              ...mergeProjectCompatibilityForHostRepoChange({
                previous: { projects: s.projects, projectHostSetups: s.projectHostSetups },
                nextRepos,
                hostId: ownerHostId
              }),
              folderWorkspacePathStatuses: {}
            }
          })
          return true
        } catch (err) {
          console.error('Failed to update repo:', err)
          return false
        }
      }
      const previous = updateRepoChains.get(updateChainKey)
      // Why: repo settings are persisted as full nested values. Preserve call
      // order per repo so a slower IPC/RPC response cannot overwrite newer state.
      const next = previous
        ? previous.catch(() => undefined).then(applyRepoUpdate)
        : applyRepoUpdate()
      updateRepoChains.set(updateChainKey, next)
      const cleanup = () => {
        if (updateRepoChains.get(updateChainKey) === next) {
          updateRepoChains.delete(updateChainKey)
        }
      }
      void next.then(cleanup, cleanup)
      return next
    },
    setActiveRepo: (projectId) => set({ activeRepoId: projectId }),
    reorderRepos: async (orderedIds) => {
      // Optimistically apply the new order so the sidebar updates instantly;
      // resync only if main rejects (stale permutation due to a racing add/remove).
      const previous = get().repos
      const remainingById = new Map<string, { repos: Repo[]; nextIndex: number }>()
      for (const repo of previous) {
        const existing = remainingById.get(repo.id)
        if (existing) {
          existing.repos.push(repo)
        } else {
          remainingById.set(repo.id, { repos: [repo], nextIndex: 0 })
        }
      }
      const next: Repo[] = []
      for (const id of orderedIds) {
        const remaining = remainingById.get(id)
        const repo = remaining?.repos[remaining.nextIndex]
        if (remaining) {
          remaining.nextIndex += 1
        }
        if (repo) {
          next.push(repo)
        }
      }
      if (next.length !== previous.length) {
        // Caller passed a non-permutation — refuse to apply locally.
        return
      }
      const manualRepoOrder = getManualRepoOrder(next)
      set({
        repos: next,
        manualRepoOrder,
        folderWorkspacePathStatuses: {}
      })
      try {
        // Why: each host persists only its own repos and rejects non-permutations,
        // so split the cross-host order into per-host permutations and dispatch one
        // reorder per owner host.
        const groups = splitRepoReorderByHost(orderedIds, next, get().settings)
        const [results] = await Promise.all([
          Promise.all(
            groups.map(async (group) => {
              const parsed = parseExecutionHostId(group.hostId)
              const target =
                parsed?.kind === 'runtime'
                  ? ({ kind: 'environment', environmentId: parsed.environmentId } as const)
                  : ({ kind: 'local' } as const)
              return target.kind === 'local'
                ? workspaceHostClient.repos.reorderForHost({
                    hostId: group.hostId,
                    orderedIds: group.orderedIds
                  })
                : callRuntimeOrpc(
                    target,
                    (client) => client.repo.reorder,
                    { orderedIds: group.orderedIds },
                    { timeoutMs: 15_000 }
                  )
            })
          ),
          // Why: servers can only persist their local permutations. The desktop
          // profile owns the cross-host relationships needed after a cold load.
          setRuntimeUIState(get().settings, { manualRepoOrder })
        ])
        if (results.some((result) => result.status === 'rejected')) {
          await get().fetchReposForAllHosts()
        }
      } catch (err) {
        console.error('Failed to reorder repos:', err)
        await get().fetchReposForAllHosts()
      }
    }
  }
}
