import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import { DEFAULT_REPO_BADGE_COLOR } from '@yiru/runtime-protocol/workbench/constants'
import { isFolderRepo } from '@yiru/runtime-protocol/workbench/repo-kind'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import { invalidateAuthorizedRootsCache } from '~main/filesystem/auth'
import { getGitCloneFailureMessage } from '~main/git/repo/clone-failure-message'
import { getRepoName } from '~main/git/repo/repo'
import {
  cleanupClaimedCloneTarget,
  claimCloneTarget,
  getClonePathComparisonKey
} from '~main/git/repo/repo-clone-path'
import { gitSpawn, nonInteractiveGitEnv } from '~main/git/runner/runner'
import { detectRepoIconAndUpstream } from '~main/projects/icon-autodetect'
import { prepareLocalWorktreeRootForRepo } from '~main/worktree/root-preparation'

import { runtimeRepoMatchesExecutionHost } from '../model/worktree-storage'
import type { RepositoryServiceContext } from './service-context'

export const cloneRepoAfterPathLockMethods = {
  async cloneRepoAfterPathLock(
    trimmedUrl: string,
    trimmedDestination: string,
    clonePath: string,
    clonePathKey: string,
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo> {
    const existingBeforeClone = this.store
      .getRepos()
      .find(
        (repo) =>
          getClonePathComparisonKey(repo.path) === clonePathKey &&
          runtimeRepoMatchesExecutionHost(repo, executionHostId)
      )
    if (existingBeforeClone && !isFolderRepo(existingBeforeClone)) {
      return existingBeforeClone
    }

    await mkdir(trimmedDestination, { recursive: true })
    const claimedTarget = await claimCloneTarget(clonePath)
    await new Promise<void>((resolve, reject) => {
      let proc: ReturnType<typeof gitSpawn>
      try {
        proc = gitSpawn(['clone', '--progress', '--', trimmedUrl, clonePath], {
          cwd: trimmedDestination,
          // Why: without the non-interactive guard, a clone that needs GitHub
          // auth makes Git Credential Manager pop its "Connect to GitHub" OAuth
          // window on Windows; in a network-restricted env the browser/device
          // flow can never complete and git's credential retry re-pops it
          // (issue #7652). Fail fast with a clear error instead.
          env: nonInteractiveGitEnv(),
          stdio: ['ignore', 'ignore', 'pipe']
        })
      } catch (err) {
        void cleanupClaimedCloneTarget(clonePath, claimedTarget).finally(() => {
          const message = err instanceof Error ? err.message : String(err)
          reject(new Error(`Clone failed: ${message}`))
        })
        return
      }
      this.activeRepoClone = proc
      let stderrTail = ''
      let settled = false
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderrTail = (stderrTail + text).slice(-4096)
        for (const line of text.split(/[\r\n]+/)) {
          const match = line.match(/^([\w\s]+):\s+(\d+)%/)
          if (match) {
            this.emitHostProgressEvent({
              type: 'repoCloneProgress',
              phase: match[1].trim(),
              percent: Number.parseInt(match[2], 10)
            })
          }
        }
      })
      const finishClone = async (
        code: number | null,
        signal: NodeJS.Signals | null,
        error?: Error
      ) => {
        if (settled) {
          return
        }
        settled = true
        if (this.activeRepoClone === proc) {
          this.activeRepoClone = null
        }
        const cloneSucceeded = !error && code === 0 && !signal
        if (!cloneSucceeded) {
          await cleanupClaimedCloneTarget(clonePath, claimedTarget)
        }

        if (error) {
          reject(new Error(`Clone failed: ${error.message}`))
        } else if (signal === 'SIGTERM') {
          reject(new Error('Clone aborted'))
        } else if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Clone failed: ${getGitCloneFailureMessage(stderrTail, { clonePath })}`))
        }
      }
      proc.on('error', (error) => {
        void finishClone(null, null, error)
      })
      proc.on('close', (code, signal) => {
        void finishClone(code, signal)
      })
    })

    const existing = this.store
      .getRepos()
      .find(
        (repo) =>
          getClonePathComparisonKey(repo.path) === clonePathKey &&
          runtimeRepoMatchesExecutionHost(repo, executionHostId)
      )
    if (existing) {
      if (isFolderRepo(existing)) {
        const updated = this.store.updateRepo(existing.id, { kind: 'git' })
        if (updated) {
          await prepareLocalWorktreeRootForRepo(this.store, updated)
          invalidateAuthorizedRootsCache()
          this.invalidateResolvedWorktreeCache()
          this.notifyReposChanged()
          return updated
        }
      }
      return existing
    }

    const detected = await detectRepoIconAndUpstream({ repoPath: clonePath, kind: 'git' })
    const repo: Repo = {
      id: randomUUID(),
      path: clonePath,
      displayName: getRepoName(clonePath),
      badgeColor: DEFAULT_REPO_BADGE_COLOR,
      ...(executionHostId != null ? { executionHostId } : {}),
      ...detected,
      addedAt: Date.now(),
      kind: 'git',
      externalWorktreeVisibility: 'hide',
      externalWorktreeVisibilityLegacy: false
    }
    this.store.addRepo(repo)
    await prepareLocalWorktreeRootForRepo(this.store, repo)
    invalidateAuthorizedRootsCache()
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return this.store.getRepo(repo.id) ?? repo
  },

  async showRepo(repoSelector: string): Promise<Repo> {
    return await this.resolveRepoSelector(repoSelector)
  },

  async setRepoBaseRef(repoSelector: string, baseRef: string): Promise<Repo> {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      throw new Error('Folder mode does not support base refs.')
    }
    const updated = this.store.updateRepo(repo.id, { worktreeBaseRef: baseRef })
    if (!updated) {
      throw new Error('repo_not_found')
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return updated
  }
} satisfies ThisType<RepositoryServiceContext>
