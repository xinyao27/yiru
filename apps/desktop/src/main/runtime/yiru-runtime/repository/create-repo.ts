import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { invalidateAuthorizedRootsCache, isENOENT } from '~main/filesystem/auth'
import { deriveValidatedClonePath, getClonePathComparisonKey } from '~main/git/repo-clone-path'
import { gitExecFileAsync } from '~main/git/runner'
import { runWithGitReadCacheInvalidation } from '~main/git/status'
import { detectRepoIconAndUpstream } from '~main/repo-icon-autodetect'
import { prepareLocalWorktreeRootForRepo } from '~main/worktree-root-preparation'
import { DEFAULT_REPO_BADGE_COLOR } from '~shared/constants'
import type { Repo } from '~shared/types'

import { runtimePathsEqual } from '../model/worktree-identity'
import { RuntimeRepositoryAddRepo } from './add-repo'

export abstract class RuntimeRepositoryCreateRepo extends RuntimeRepositoryAddRepo {
  async createRepo(
    parentPath: string,
    name: string,
    kind: 'git' | 'folder' = 'git'
  ): Promise<{ repo: Repo } | { error: string }> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const trimmedName = name.trim()
    const trimmedParentPath = parentPath.trim()
    const repoKind: 'git' | 'folder' = kind === 'folder' ? 'folder' : 'git'
    if (!trimmedName) {
      return { error: 'Name cannot be empty' }
    }
    if (/[\\/]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..') {
      return { error: 'Name cannot contain slashes or be "." / ".."' }
    }
    if (!trimmedParentPath) {
      return { error: 'Parent directory is required' }
    }
    if (!isAbsolute(trimmedParentPath)) {
      return { error: 'Parent directory must be an absolute path' }
    }

    const targetPath = join(trimmedParentPath, trimmedName)
    const existing = this.store
      .getRepos()
      .find(
        (repo) =>
          getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID &&
          runtimePathsEqual(repo.path, targetPath)
      )
    if (existing) {
      return { repo: existing }
    }

    let createdDir = false
    try {
      // Why: default create-project parents are host-home based and may not exist
      // before the first project is created on a fresh runtime.
      await mkdir(trimmedParentPath, { recursive: true })
      const existingStat = await stat(targetPath).catch((error: unknown) => {
        if (isENOENT(error)) {
          return null
        }
        throw error
      })
      if (existingStat) {
        if (!existingStat.isDirectory()) {
          return { error: `"${trimmedName}" already exists at this location and is not a folder.` }
        }
        const entries = await readdir(targetPath)
        if (entries.length > 0) {
          return { error: `"${trimmedName}" already exists at this location and is not empty.` }
        }
      } else {
        await mkdir(targetPath, { recursive: false })
        createdDir = true
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { error: `Failed to prepare directory: ${message}` }
    }

    if (repoKind === 'git') {
      let step: 'init' | 'commit' = 'init'
      try {
        await gitExecFileAsync(['init'], { cwd: targetPath })
        step = 'commit'
        await gitExecFileAsync(['commit', '--allow-empty', '-m', 'Initial commit'], {
          cwd: targetPath
        })
      } catch (error) {
        if (createdDir) {
          await rm(targetPath, { recursive: true, force: true }).catch(() => {})
        } else if (step === 'commit') {
          await rm(join(targetPath, '.git'), { recursive: true, force: true }).catch(() => {})
        }
        const message = error instanceof Error ? error.message : String(error)
        if (
          step === 'commit' &&
          /Please tell me who you are|user\.name|user\.email/i.test(message)
        ) {
          return {
            error:
              'Git author identity is not configured. Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then try again.'
          }
        }
        const stepLabel =
          step === 'init'
            ? 'Failed to initialize git repository'
            : 'Failed to create initial commit'
        return { error: `${stepLabel}: ${message}` }
      }
    }

    const raceWinner = this.store
      .getRepos()
      .find(
        (repo) =>
          getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID &&
          runtimePathsEqual(repo.path, targetPath)
      )
    if (raceWinner) {
      return { repo: raceWinner }
    }

    const detected = await detectRepoIconAndUpstream({ repoPath: targetPath, kind: repoKind })
    const repo: Repo = {
      id: randomUUID(),
      path: targetPath,
      displayName: trimmedName,
      badgeColor: DEFAULT_REPO_BADGE_COLOR,
      ...detected,
      addedAt: Date.now(),
      kind: repoKind,
      ...(repoKind === 'git'
        ? {
            externalWorktreeVisibility: 'hide' as const,
            externalWorktreeVisibilityLegacy: false
          }
        : {})
    }
    this.store.addRepo(repo)
    await prepareLocalWorktreeRootForRepo(this.store, repo)
    invalidateAuthorizedRootsCache()
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return { repo: this.store.getRepo(repo.id) ?? repo }
  }

  async cloneRepo(
    url: string,
    destination: string,
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const trimmedUrl = url.trim()
    const trimmedDestination = destination.trim()
    if (!trimmedDestination) {
      throw new Error('Clone destination is required')
    }
    const clonePath = deriveValidatedClonePath({ url: trimmedUrl, destination: trimmedDestination })
    const clonePathKey = getClonePathComparisonKey(clonePath)
    const previous = this.cloneInFlightByPath.get(clonePathKey) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(
      () => current,
      () => current
    )
    this.cloneInFlightByPath.set(clonePathKey, tail)

    try {
      await previous
      return await runWithGitReadCacheInvalidation(() =>
        this.cloneRepoAfterPathLock(
          trimmedUrl,
          trimmedDestination,
          clonePath,
          clonePathKey,
          executionHostId
        )
      )
    } finally {
      release()
      if (this.cloneInFlightByPath.get(clonePathKey) === tail) {
        this.cloneInFlightByPath.delete(clonePathKey)
      }
    }
  }

  abortRepoClone(): void {
    this.activeRepoClone?.kill()
    this.activeRepoClone = null
  }
}
