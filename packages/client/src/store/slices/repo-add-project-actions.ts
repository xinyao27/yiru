import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { isGitRepoKind } from '~shared/repo-kind'
import type { Repo } from '~shared/types'

import type { AppState } from '../types'
import { mergeProjectCompatibilityForHostRepoChange } from './repo-catalog-merge'
import { getRepoHostIdentity, repoMatchesHostIdentity } from './repo-host-identity'
import {
  getAddRepoPathRouteSettings,
  getRuntimeEnvironmentDisplayName,
  fetchRuntimeAddProjectPathStatus
} from './repo-path-status-model'
import {
  getProjectSetupRuntimeTarget,
  warnIfProjectKnownInAnotherProfile,
  repoWithFetchedOwner,
  setupWithFetchedOwner,
  assertProjectHostSetupMutationRuntimeCapabilities
} from './repo-target-model'
import type { RepoSlice } from './repos'

export function createRepoAddProjectActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'addRepoPath' | 'setupProjectExistingFolder'> {
  return {
    addRepoPath: async (path, kind = 'git', options) => {
      try {
        const target = getActiveRuntimeTarget(getAddRepoPathRouteSettings(options, get().settings))
        let repo: Repo
        try {
          if (target.kind === 'local') {
            const result = await workspaceHostClient.repos.add({ path, kind })
            if ('error' in result) {
              throw new Error(result.error)
            }
            repo = result.repo
          } else {
            repo = (
              await callRuntimeOrpc(
                target,
                (client) => client.repo.add,
                { path, kind },
                { timeoutMs: 15_000 }
              )
            ).repo
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (kind !== 'git' || !message.includes('Not a valid git repository')) {
            throw err
          }
          if (target.kind !== 'local') {
            const status = await fetchRuntimeAddProjectPathStatus({ target, path })
            if (status?.exists !== true) {
              const hostName = getRuntimeEnvironmentDisplayName(get(), target.environmentId)
              publishRendererCommandResult({
                type: 'repository-runtime-folder-unavailable',
                path,
                hostName
              })
              return null
            }
          }
          // Why: folder mode is a capability downgrade, not a silent fallback.
          // Show an in-app confirmation dialog so users understand that worktrees,
          // SCM, PRs, and checks will be unavailable for this root. The dialog's
          // The dialog routes the accepted path through the folder-add command.
          const { openModal } = get()
          openModal('confirm-non-git-folder', {
            folderPath: path,
            ...(target.kind === 'environment' ? { runtimeEnvironmentId: target.environmentId } : {})
          })
          return null
        }
        repo = repoWithFetchedOwner(repo, target)
        const repoIdentity = getRepoHostIdentity(repo)
        const alreadyAdded = get().repos.some((r) => getRepoHostIdentity(r) === repoIdentity)
        if (alreadyAdded) {
          get().clearYiruHookTrustForRepo(repo.id)
        }
        set((s) => {
          if (s.repos.some((r) => getRepoHostIdentity(r) === repoIdentity)) {
            return s
          }
          const nextRepos = [...s.repos, repo]
          const hostId = getRepoExecutionHostId(repo)
          return {
            repos: nextRepos,
            ...mergeProjectCompatibilityForHostRepoChange({
              previous: { projects: s.projects, projectHostSetups: s.projectHostSetups },
              nextRepos,
              hostId
            }),
            folderWorkspacePathStatuses: {}
          }
        })
        if (alreadyAdded) {
          publishRendererCommandResult({
            type: 'repository-add',
            outcome: 'already-added',
            displayName: repo.displayName
          })
        } else {
          publishRendererCommandResult({
            type: 'repository-add',
            outcome: 'added',
            projectKind: isGitRepoKind(repo) ? 'git' : 'folder',
            displayName: repo.displayName
          })
          // Why: the design requires the cross-profile advisory for paired-runtime
          // projects too because the presence lookup is already host-scoped.
          await warnIfProjectKnownInAnotherProfile(repo, get().activeYiruProfileId)
        }
        return repo
      } catch (err) {
        console.error('Failed to add project:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    setupProjectExistingFolder: async (args) => {
      try {
        const target = getProjectSetupRuntimeTarget(args.hostId)
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const result = (
          await callRuntimeOrpc(
            target,
            (client) => client.projectHostSetup.setupExistingFolder,
            args,
            { timeoutMs: 15_000 }
          )
        ).result
        const repo = repoWithFetchedOwner(result.repo, target)
        const repoHostId = getRepoExecutionHostId(repo)
        const setup = setupWithFetchedOwner(result.setup, target)
        set((s) => {
          const nextRepos = s.repos.some((entry) =>
            repoMatchesHostIdentity(entry, repo.id, repoHostId)
          )
            ? s.repos.map((entry) =>
                repoMatchesHostIdentity(entry, repo.id, repoHostId) ? repo : entry
              )
            : [...s.repos, repo]
          const nextProjects = s.projects.some((entry) => entry.id === result.project.id)
            ? s.projects.map((entry) => (entry.id === result.project.id ? result.project : entry))
            : [...s.projects, result.project]
          const nextSetups = s.projectHostSetups.some((entry) => entry.id === setup.id)
            ? s.projectHostSetups.map((entry) => (entry.id === setup.id ? setup : entry))
            : [...s.projectHostSetups, setup]
          return {
            repos: nextRepos,
            projects: nextProjects,
            projectHostSetups: nextSetups
          }
        })
        publishRendererCommandResult({
          type: 'repository-add',
          outcome: 'added',
          projectKind: 'git',
          displayName: repo.displayName
        })
        return { ...result, repo, setup }
      } catch (err) {
        console.error('Failed to set up project on host:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    }
  }
}
