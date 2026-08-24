import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'

import { parseExecutionHostId, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import { isGitRepo, getRepoName } from '~main/git/repo'
import { detectRepoIconAndUpstream } from '~main/repo-icon-autodetect'
import { prepareLocalWorktreeRootForRepo } from '~main/worktree-root-preparation'
import { DEFAULT_REPO_BADGE_COLOR } from '~shared/constants'
import type { Repo } from '~shared/types'

import { runtimePathsEqual } from '../model/worktree-identity'
import { runtimeRepoMatchesExecutionHost } from '../model/worktree-storage'
import { RuntimeRepositorySaveSparsePreset } from './save-sparse-preset'

export abstract class RuntimeRepositoryAddRepo extends RuntimeRepositorySaveSparsePreset {
  async addRepo(
    path: string,
    kind: 'git' | 'folder' = 'git',
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    if (!isAbsolute(path)) {
      // Why: remote clients may run in a different cwd than the server. Require
      // server-side repo paths to be explicit so `yiru serve` cwd is irrelevant.
      throw new Error('Project path must be an absolute path')
    }
    if (kind === 'git' && !isGitRepo(path)) {
      throw new Error(`Not a valid git repository: ${path}`)
    }

    const existing = this.store.getRepos().find((repo) => {
      if (!runtimePathsEqual(repo.path, path)) {
        return false
      }
      return runtimeRepoMatchesExecutionHost(repo, executionHostId)
    })
    if (existing) {
      // Why: only a runtime host backfills a legacy unstamped repo. An unstamped repo
      // is indistinguishable from a genuine local repo because both lack executionHostId,
      // so a local caller never stamps it. Runtime is the only host that lost its
      // identity to the pre-#7018 path-only import and needs the backfill.
      if (
        existing.executionHostId == null &&
        parseExecutionHostId(executionHostId)?.kind === 'runtime'
      ) {
        const adopted =
          this.store.updateRepo(existing.id, { executionHostId }) ??
          ({ ...existing, executionHostId } as Repo)
        this.invalidateResolvedWorktreeCache()
        this.notifyReposChanged()
        return adopted
      }
      return existing
    }

    const detected = await detectRepoIconAndUpstream({ repoPath: path, kind })
    const repo: Repo = {
      id: randomUUID(),
      path,
      displayName: getRepoName(path),
      badgeColor: DEFAULT_REPO_BADGE_COLOR,
      ...(executionHostId != null ? { executionHostId } : {}),
      ...detected,
      addedAt: Date.now(),
      kind,
      ...(kind === 'git'
        ? {
            externalWorktreeVisibility: 'hide' as const,
            externalWorktreeVisibilityLegacy: false
          }
        : {})
    }
    this.store.addRepo(repo)
    await prepareLocalWorktreeRootForRepo(this.store, repo)
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return this.store.getRepo(repo.id) ?? repo
  }
}
