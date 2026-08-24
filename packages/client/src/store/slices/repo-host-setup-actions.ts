import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'

import type { AppState } from '../types'
import { repoMatchesHostIdentity } from './repo-host-identity'
import {
  getProjectSetupRuntimeTarget,
  repoWithFetchedOwner,
  setupWithFetchedOwner,
  assertProjectHostSetupMutationRuntimeCapabilities
} from './repo-target-model'
import type { RepoSlice } from './repos'
import { omitSparsePresetsForRepos } from './sparse-presets'

export function createRepoHostSetupActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<
  RepoSlice,
  | 'createProjectHostSetup'
  | 'updateProjectHostSetup'
  | 'deleteProjectHostSetup'
  | 'setupProjectClone'
  | 'addRepo'
  | 'registerNonGitFolder'
> {
  return {
    createProjectHostSetup: async (args) => {
      try {
        const target = getProjectSetupRuntimeTarget(args.hostId)
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const result = (
          await callRuntimeOrpc(target, (client) => client.projectHostSetup.create, args, {
            timeoutMs: 15_000
          })
        ).result
        const setup = setupWithFetchedOwner(result.setup, target)
        set((s) => ({
          projects: s.projects.some((entry) => entry.id === result.project.id)
            ? s.projects.map((entry) => (entry.id === result.project.id ? result.project : entry))
            : [...s.projects, result.project],
          projectHostSetups: s.projectHostSetups.some((entry) => entry.id === setup.id)
            ? s.projectHostSetups.map((entry) => (entry.id === setup.id ? setup : entry))
            : [...s.projectHostSetups, setup]
        }))
        return { project: result.project, setup }
      } catch (err) {
        console.error('Failed to create project host setup:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    updateProjectHostSetup: async (args) => {
      try {
        const currentSetup = get().projectHostSetups.find((setup) => setup.id === args.setupId)
        const target = currentSetup
          ? getProjectSetupRuntimeTarget(currentSetup.hostId)
          : { kind: 'local' as const }
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const result = (
          await callRuntimeOrpc(target, (client) => client.projectHostSetup.update, args, {
            timeoutMs: 15_000
          })
        ).result
        const setup = setupWithFetchedOwner(result.setup, target)
        const repo = result.repo ? repoWithFetchedOwner(result.repo, target) : undefined
        const repoHostId = repo ? getRepoExecutionHostId(repo) : null
        set((s) => ({
          repos: repo
            ? s.repos.some((entry) => repoMatchesHostIdentity(entry, repo.id, repoHostId!))
              ? s.repos.map((entry) =>
                  repoMatchesHostIdentity(entry, repo.id, repoHostId!) ? repo : entry
                )
              : [...s.repos, repo]
            : s.repos,
          projects: s.projects.some((entry) => entry.id === result.project.id)
            ? s.projects.map((entry) => (entry.id === result.project.id ? result.project : entry))
            : [...s.projects, result.project],
          projectHostSetups: s.projectHostSetups.some((entry) => entry.id === setup.id)
            ? s.projectHostSetups.map((entry) => (entry.id === setup.id ? setup : entry))
            : [...s.projectHostSetups, setup]
        }))
        return { ...result, repo, setup }
      } catch (err) {
        console.error('Failed to update project host setup:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    deleteProjectHostSetup: async (args) => {
      try {
        const currentSetup = get().projectHostSetups.find((setup) => setup.id === args.setupId)
        const target = currentSetup
          ? getProjectSetupRuntimeTarget(currentSetup.hostId)
          : { kind: 'local' as const }
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const result = (
          await callRuntimeOrpc(target, (client) => client.projectHostSetup.delete, args, {
            timeoutMs: 15_000
          })
        ).result
        const repo = result.repo ? repoWithFetchedOwner(result.repo, target) : undefined
        const repoHostId = repo ? getRepoExecutionHostId(repo) : null
        set((s) => {
          const projectHostSetups = s.projectHostSetups.filter(
            (setup) => setup.id !== result.setup.id
          )
          const repos =
            repo && repoHostId
              ? s.repos.filter((entry) => !repoMatchesHostIdentity(entry, repo.id, repoHostId))
              : s.repos
          const projects =
            repo && !projectHostSetups.some((setup) => setup.projectId === result.project.id)
              ? s.projects.filter((project) => project.id !== result.project.id)
              : s.projects
          const survivingRepoIds = new Set(repos.map((r) => r.id))
          const removedRepoIds = s.repos.filter((r) => !survivingRepoIds.has(r.id)).map((r) => r.id)
          return {
            repos,
            projects,
            projectHostSetups,
            ...omitSparsePresetsForRepos(s, removedRepoIds)
          }
        })
        return { ...result, repo }
      } catch (err) {
        console.error('Failed to delete project host setup:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    setupProjectClone: async (args) => {
      try {
        const target = getProjectSetupRuntimeTarget(args.hostId)
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const repo =
          target.kind === 'local'
            ? await workspaceHostClient.repos.clone({
                url: args.url,
                destination: args.destination
              })
            : (
                await callRuntimeOrpc(
                  target,
                  (client) => client.repo.clone,
                  {
                    url: args.url,
                    destination: args.destination
                  },
                  { timeoutMs: 10 * 60_000 }
                )
              ).repo
        return await get().setupProjectExistingFolder({
          projectId: args.projectId,
          hostId: args.hostId,
          path: repo.path,
          kind: 'git',
          displayName: args.displayName,
          setupMethod: 'cloned'
        })
      } catch (err) {
        console.error('Failed to clone project on host:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    addRepo: async () => {
      const target = getActiveRuntimeTarget(get().settings)
      if (target.kind !== 'local') {
        // Why: OS folder pickers return client-local paths. Remote environments
        // need an explicit host path, which the Add Project dialog handles.
        publishRendererCommandResult({ type: 'repository-add-route-required' })
        return null
      }
      const path = await workspaceHostClient.repos.pickFolder()
      if (!path) {
        return null
      }
      return get().addRepoPath(path)
    },
    registerNonGitFolder: async (path, options) => {
      try {
        return await get().addRepoPath(path, 'folder', options)
      } catch (err) {
        console.error('Failed to add folder:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-folder-add-failed', error: message })
        return null
      }
    }
  }
}
