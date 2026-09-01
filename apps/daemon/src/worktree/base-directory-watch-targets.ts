import { realpath, stat } from 'node:fs/promises'
import { normalize } from 'node:path'

import {
  getRuntimePathBasename,
  normalizeRuntimePathForComparison
} from '@yiru/runtime-protocol/model/platform'
import { isWslUncPath } from '@yiru/runtime-protocol/model/platform'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@yiru/runtime-protocol/model/workspace'
import { isFolderRepo } from '@yiru/runtime-protocol/workbench/repo-kind'
import type { GlobalSettings, Repo } from '@yiru/runtime-protocol/workbench/types'

import type { Store } from '../persistence/store'
import type {
  WorktreeBaseRepoWatchConfig,
  WorktreeBaseWatchKind,
  WorktreeBaseWatchTarget
} from './base-directory-event-filter'
import { shouldEmitBoundedWarning } from './bounded-warning-dedupe'
import { resolveWorktreeCommonGitDirectory } from './git-directory'
import { computeWorkspaceRoot, getWorktreePathSettings } from './logic'

const missingRootWarnings = new Set<string>()
const skippedWslWarnings = new Set<string>()

function normalizeWatchKey(pathValue: string): string {
  return normalizeRuntimePathForComparison(normalize(pathValue))
}

async function canonicalizeExistingPath(pathValue: string): Promise<string> {
  try {
    return await realpath(pathValue)
  } catch {
    return normalize(pathValue)
  }
}

async function addTarget(
  targets: Map<string, WorktreeBaseWatchTarget>,
  kind: WorktreeBaseWatchKind,
  pathValue: string,
  config: WorktreeBaseRepoWatchConfig
): Promise<void> {
  const watchedPath = await canonicalizeExistingPath(pathValue)
  const key = `${kind}:local:${normalizeWatchKey(watchedPath)}`
  const existing = targets.get(key)
  if (existing) {
    existing.repos.set(config.repoId, config)
    return
  }
  targets.set(key, {
    key,
    kind,
    path: watchedPath,
    repos: new Map([[config.repoId, config]])
  })
}

function getBaseWatchLayout(
  repo: Repo,
  pathSettings: Pick<GlobalSettings, 'workspaceDir' | 'nestWorkspaces'>
): { workspaceRoot: string; nestWorkspaces: boolean } {
  return {
    workspaceRoot: computeWorkspaceRoot(repo.path, pathSettings),
    nestWorkspaces: pathSettings.nestWorkspaces
  }
}

async function maybeAddBaseTarget(
  targets: Map<string, WorktreeBaseWatchTarget>,
  repo: Repo,
  settings: GlobalSettings
): Promise<void> {
  const pathSettings = getWorktreePathSettings(repo, settings)
  const { workspaceRoot, nestWorkspaces } = getBaseWatchLayout(repo, pathSettings)
  // Why: WSL UNC roots are unreliable for native watching; avoid project-level polling.
  if (isWslUncPath(workspaceRoot) || isWslUncPath(repo.path)) {
    const key = `${repo.id}:${workspaceRoot}`
    if (shouldEmitBoundedWarning(skippedWslWarnings, key)) {
      console.warn(
        `[worktree-base-watcher] skipping WSL worktree root watcher for ${workspaceRoot}`
      )
    }
    return
  }

  const config = {
    repoId: repo.id,
    repoName: getRuntimePathBasename(repo.path).replace(/\.git$/, ''),
    nestWorkspaces
  }
  try {
    const rootStat = await stat(workspaceRoot)
    if (rootStat.isDirectory()) {
      await addTarget(targets, 'base', workspaceRoot, config)
    }
  } catch {
    const key = normalizeWatchKey(workspaceRoot)
    if (shouldEmitBoundedWarning(missingRootWarnings, key)) {
      console.warn(`[worktree-base-watcher] worktree root unavailable: ${workspaceRoot}`)
    }
  }

  const commonDir = await resolveWorktreeCommonGitDirectory(repo)
  if (commonDir) {
    await addTarget(targets, 'git-common', commonDir, config)
  }
}

export async function buildWorktreeBaseDirectoryWatchTargets(
  store: Store
): Promise<Map<string, WorktreeBaseWatchTarget>> {
  const settings = store.getSettings()
  const targets = new Map<string, WorktreeBaseWatchTarget>()
  for (const repo of store.getRepos()) {
    if (isFolderRepo(repo) || getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    await maybeAddBaseTarget(targets, repo, settings)
  }
  return targets
}

export function clearWorktreeBaseDirectoryWatchTargetWarnings(): void {
  missingRootWarnings.clear()
  skippedWslWarnings.clear()
}
