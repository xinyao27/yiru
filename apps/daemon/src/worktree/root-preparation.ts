import { mkdir } from 'node:fs/promises'

import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@yiru/runtime-protocol/model/workspace'
import { isFolderRepo } from '@yiru/runtime-protocol/workbench/repo-kind'
import type { GlobalSettings, Repo } from '@yiru/runtime-protocol/workbench/types'

import { computeWorkspaceRoot, getWorktreePathSettings } from './logic'

type WorktreeRootPreparationSettings = Pick<GlobalSettings, 'workspaceDir' | 'nestWorkspaces'>
type WorktreeRootPreparationStore = {
  getSettings: () => WorktreeRootPreparationSettings
  getRepos: () => Repo[]
}

export async function prepareLocalWorktreeRootForRepo(
  store: Pick<WorktreeRootPreparationStore, 'getSettings'>,
  repo: Repo
): Promise<void> {
  if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID || isFolderRepo(repo)) {
    return
  }

  try {
    const root = computeWorkspaceRoot(repo.path, getWorktreePathSettings(repo, store.getSettings()))
    // Why: mkdir touches the current root to preflight macOS TCC, while
    // access remains scoped by recomputed settings instead of a permanent grant.
    await mkdir(root, { recursive: true })
  } catch (error) {
    console.warn(`[worktree-root] failed to prepare worktree root for ${repo.path}:`, error)
  }
}

export async function prepareLocalWorktreeRootsForRepos(
  store: WorktreeRootPreparationStore
): Promise<void> {
  await Promise.all(store.getRepos().map((repo) => prepareLocalWorktreeRootForRepo(store, repo)))
}
