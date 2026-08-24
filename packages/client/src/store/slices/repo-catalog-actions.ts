import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { filterSetupScriptPromptDismissalsToValidRepos } from '~renderer/components/sidebar/setup-script-prompt'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { applyManualRepoOrder } from '~shared/manual-repo-order'
import type { Repo } from '~shared/types'

import type { AppState } from '../types'
import {
  fetchRepoCatalogForTarget,
  mergeFetchedRepoCatalog,
  projectCompatibilityForReconciledRepos,
  filterTrustedYiruHooksToValidRepos,
  listRuntimeEnvironmentsForAllHostLoad,
  type FetchedRepoCatalog
} from './repo-catalog-fetch'
import { mergeFetchedProjectCompatibilityForHost } from './repo-compatibility-model'
import {
  getFirstPaintCatalogTarget,
  isEnvironmentAlreadyLoaded,
  scheduleSafeAutoForkSync
} from './repo-target-model'
import type { RepoSlice } from './repos'

export function createRepoCatalogActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'fetchRepos' | 'fetchRuntimeEnvironmentRepos' | 'fetchReposForAllHosts'> {
  return {
    fetchRepos: async () => {
      // Why: overlapping repos:changed fetches can resolve out of order; an earlier
      // one must not overwrite a newer result and resurrect deleted projects (#7020).
      let generation = 0
      set((s) => {
        generation = s.reposFetchGeneration + 1
        return { reposFetchGeneration: generation }
      })
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const catalog = await fetchRepoCatalogForTarget(target)
        // A newer fetchRepos superseded us while we awaited — drop this stale result.
        if (get().reposFetchGeneration !== generation) {
          return
        }
        let finalizedHostRepos: Repo[] = []
        set((s) => {
          const result = mergeFetchedRepoCatalog(catalog, s.repos)
          const prunedRepos = applyManualRepoOrder(result.repos, s.manualRepoOrder)
          const validRepoIds = new Set(prunedRepos.map((repo) => repo.id))
          const projectCompatibility = projectCompatibilityForReconciledRepos(
            prunedRepos,
            catalog.projectHostSetupCompatibility
          )
          const mergedProjectCompatibility = mergeFetchedProjectCompatibilityForHost({
            previous: {
              projects: s.projects,
              projectHostSetups: s.projectHostSetups
            },
            fetched: projectCompatibility,
            repos: prunedRepos,
            hostId: result.hostId
          })
          finalizedHostRepos = prunedRepos.filter(
            (repo) => getRepoExecutionHostId(repo) === result.hostId
          )
          return {
            repos: prunedRepos,
            ...mergedProjectCompatibility,
            folderWorkspacePathStatuses: {},
            activeRepoId:
              s.activeRepoId && validRepoIds.has(s.activeRepoId) ? s.activeRepoId : null,
            filterRepoIds: s.filterRepoIds.filter((projectId) => validRepoIds.has(projectId)),
            setupScriptPromptDismissedRepoIds: filterSetupScriptPromptDismissalsToValidRepos(
              s.setupScriptPromptDismissedRepoIds,
              validRepoIds
            )
          }
        })
        scheduleSafeAutoForkSync(get, finalizedHostRepos)
      } catch (err) {
        console.error('Failed to fetch repos:', err)
      }
    },
    fetchRuntimeEnvironmentRepos: async (environmentId) => {
      try {
        const target = { kind: 'environment' as const, environmentId }
        const catalog = await fetchRepoCatalogForTarget(target)
        let finalizedHostRepos: Repo[] = []
        set((s) => {
          const result = mergeFetchedRepoCatalog(catalog, s.repos)
          const finalizedRepos = applyManualRepoOrder(result.repos, s.manualRepoOrder)
          const validRepoIds = new Set(finalizedRepos.map((repo) => repo.id))
          const projectCompatibility = projectCompatibilityForReconciledRepos(
            finalizedRepos,
            catalog.projectHostSetupCompatibility
          )
          const mergedProjectCompatibility = mergeFetchedProjectCompatibilityForHost({
            previous: {
              projects: s.projects,
              projectHostSetups: s.projectHostSetups
            },
            fetched: projectCompatibility,
            repos: finalizedRepos,
            hostId: result.hostId
          })
          finalizedHostRepos = finalizedRepos.filter(
            (repo) => getRepoExecutionHostId(repo) === result.hostId
          )
          return {
            repos: finalizedRepos,
            ...mergedProjectCompatibility,
            activeRepoId:
              s.activeRepoId && validRepoIds.has(s.activeRepoId) ? s.activeRepoId : null,
            filterRepoIds: s.filterRepoIds.filter((projectId) => validRepoIds.has(projectId)),
            setupScriptPromptDismissedRepoIds: filterSetupScriptPromptDismissalsToValidRepos(
              s.setupScriptPromptDismissedRepoIds,
              validRepoIds
            )
          }
        })
        scheduleSafeAutoForkSync(get, finalizedHostRepos)
        return finalizedHostRepos
      } catch (err) {
        console.error(`Failed to fetch repos for runtime environment ${environmentId}:`, err)
        return []
      }
    },
    fetchReposForAllHosts: async (options) => {
      let generation = 0
      set((s) => {
        generation = s.reposFetchGeneration + 1
        return { reposFetchGeneration: generation }
      })
      // Why: a cold start that restores a remote workspace re-activates that
      // remote runtime environment, and fetching only the active host hides every
      // other host's repos (notably all local repos), which reads as "my projects
      // vanished". Load local + every configured runtime environment so the
      // sidebar "All hosts" scope shows them together regardless of which
      // environment is active. Each host fails soft: an unreachable/disconnected
      // host is skipped without blocking the others.
      const applyCatalog = (catalog: FetchedRepoCatalog): void => {
        // Why: repos:changed can start another all-host refresh while this one is
        // in flight. Never let the older catalog overwrite newer ownership.
        if (get().reposFetchGeneration !== generation) {
          return
        }
        let hostRepos: Repo[] = []
        set((s) => {
          const result = mergeFetchedRepoCatalog(catalog, s.repos)
          const finalizedRepos = applyManualRepoOrder(result.repos, s.manualRepoOrder)
          const projectCompatibility = projectCompatibilityForReconciledRepos(
            finalizedRepos,
            catalog.projectHostSetupCompatibility
          )
          const mergedProjectCompatibility = mergeFetchedProjectCompatibilityForHost({
            previous: {
              projects: s.projects,
              projectHostSetups: s.projectHostSetups
            },
            fetched: projectCompatibility,
            repos: finalizedRepos,
            hostId: result.hostId
          })
          hostRepos = finalizedRepos.filter(
            (repo) => getRepoExecutionHostId(repo) === result.hostId
          )
          return {
            repos: finalizedRepos,
            ...mergedProjectCompatibility,
            folderWorkspacePathStatuses: {},
            activeRepoId: s.activeRepoId,
            filterRepoIds: s.filterRepoIds,
            setupScriptPromptDismissedRepoIds: s.setupScriptPromptDismissedRepoIds
          }
        })
        // Why: preserve the safe-auto fork sync that fetchRepos /
        // fetchRuntimeEnvironmentRepos schedule after merging each host, so
        // cold-start (which now routes through here) keeps updating safe-auto forks.
        scheduleSafeAutoForkSync(get, hostRepos)
      }
      const validateRepoScopedUi = (): void => {
        set((s) => {
          const validRepoIds = new Set(s.repos.map((repo) => repo.id))
          return {
            activeRepoId:
              s.activeRepoId && validRepoIds.has(s.activeRepoId) ? s.activeRepoId : null,
            filterRepoIds: s.filterRepoIds.filter((projectId) => validRepoIds.has(projectId)),
            setupScriptPromptDismissedRepoIds: filterSetupScriptPromptDismissalsToValidRepos(
              s.setupScriptPromptDismissedRepoIds,
              validRepoIds
            ),
            trustedYiruHooks: filterTrustedYiruHooksToValidRepos(s.trustedYiruHooks, validRepoIds)
          }
        })
      }

      // Own host first so its repos are present even if another host's fetch stalls.
      const firstPaintTarget = getFirstPaintCatalogTarget(get().settings)
      let failed = false
      try {
        if (firstPaintTarget) {
          applyCatalog(await fetchRepoCatalogForTarget(firstPaintTarget))
        }
      } catch (err) {
        failed = true
        console.error('Failed to fetch first-paint repos for all-host load:', err)
      }
      if (get().reposFetchGeneration !== generation) {
        return
      }
      if (options?.remoteHosts === 'skip') {
        return
      }

      const environments = await listRuntimeEnvironmentsForAllHostLoad()
      // Why: unreachable remotes can spend the full connect timeout; merge each
      // resolved host through the state updater so parallel loads do not clobber.
      await Promise.all(
        environments
          .filter((environment) => !isEnvironmentAlreadyLoaded(firstPaintTarget, environment.id))
          .map(async (environment) => {
            try {
              applyCatalog(
                await fetchRepoCatalogForTarget({
                  kind: 'environment',
                  environmentId: environment.id
                })
              )
            } catch (err) {
              failed = true
              console.warn(`Skipped repos for runtime environment ${environment.id}:`, err)
            }
          })
      )
      // Why: first-paint startup intentionally loads only local repos before
      // remotes answer. Validate repo-scoped UI only once every configured host has
      // answered; otherwise an offline runtime would erase its saved filters.
      if (!failed && get().reposFetchGeneration === generation) {
        validateRepoScopedUi()
      }
    }
  }
}
