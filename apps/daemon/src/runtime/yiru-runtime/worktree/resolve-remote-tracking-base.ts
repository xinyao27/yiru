import { randomUUID } from 'node:crypto'

import type {
  WorktreeBaseStatusEvent,
  WorktreeRemoteBranchConflictEvent
} from '@yiru/runtime-protocol/workbench/types'
import { gitExecFileAsync } from '~main/git/runner/runner'

import type { RemoteTrackingBase } from '../model/runtime-store'
import { RuntimeWorktreeGetCanonicalFetchKey } from './get-canonical-fetch-key'

export abstract class RuntimeWorktreeResolveRemoteTrackingBase extends RuntimeWorktreeGetCanonicalFetchKey {
  async resolveRemoteTrackingBase(
    repoPath: string,
    baseBranch: string,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<RemoteTrackingBase | null> {
    let remotes: string[]
    try {
      const { stdout } = await gitExecFileAsync(['remote'], { cwd: repoPath, ...gitOptions })
      remotes = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } catch {
      return null
    }

    const remoteRefPrefix = 'refs/remotes/'
    const shortBaseBranch = baseBranch.startsWith(remoteRefPrefix)
      ? baseBranch.slice(remoteRefPrefix.length)
      : baseBranch
    const remote = remotes
      .filter((candidate) => shortBaseBranch.startsWith(`${candidate}/`))
      .sort((a, b) => b.length - a.length)[0]
    if (!remote) {
      return null
    }
    const branch = shortBaseBranch.slice(remote.length + 1)
    if (!branch) {
      return null
    }
    return {
      remote,
      branch,
      ref: `refs/remotes/${remote}/${branch}`,
      base: `${remote}/${branch}`
    }
  }

  async hasRemoteTrackingRef(
    repoPath: string,
    base: RemoteTrackingBase,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<boolean> {
    try {
      await gitExecFileAsync(['rev-parse', '--verify', `${base.ref}^{commit}`], {
        cwd: repoPath,
        ...gitOptions
      })
      return true
    } catch {
      return false
    }
  }

  recordOptimisticReconcileToken(worktreeId: string): string {
    const token = randomUUID()
    this.optimisticReconcileTokens.set(worktreeId, token)
    return token
  }

  clearOptimisticReconcileToken(worktreeId: string): void {
    this.optimisticReconcileTokens.delete(worktreeId)
  }

  emitWorktreeBaseStatus(event: WorktreeBaseStatusEvent): void {
    this.emitWorktreeStateEvent({ type: 'baseStatus', ...event })
  }

  emitWorktreeRemoteBranchConflict(event: WorktreeRemoteBranchConflictEvent): void {
    this.emitWorktreeStateEvent({ type: 'remoteBranchConflict', ...event })
  }
}
