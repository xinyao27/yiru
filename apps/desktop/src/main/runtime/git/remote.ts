import { gitSyncForkDefaultBranch } from '~main/git/fork-sync'
import { gitFastForward, gitFetch, gitPull, gitPullRebaseFromBase, gitPush } from '~main/git/remote'
import { getUpstreamStatus } from '~main/git/upstream'
import type {
  GitForkSyncExpectedUpstream,
  GitForkSyncResult,
  GitPushTarget,
  GitUpstreamStatus
} from '~shared/types'

import { localGitOptionsForTarget } from './context'
import { RuntimeGitWriteCommands } from './write'

export class RuntimeGitRemoteCommands extends RuntimeGitWriteCommands {
  async getRuntimeGitUpstreamStatus(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<GitUpstreamStatus> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getUpstreamStatus(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
  }

  async fetchRuntimeGit(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitFetch(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async syncRuntimeGitForkDefaultBranch(
    worktreeSelector: string,
    expectedUpstream: GitForkSyncExpectedUpstream
  ): Promise<GitForkSyncResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return gitSyncForkDefaultBranch(
      target.worktree.path,
      expectedUpstream,
      localGitOptionsForTarget(target)
    )
  }

  async pullRuntimeGit(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitPull(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async fastForwardRuntimeGit(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitFastForward(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async rebaseRuntimeGitFromBase(worktreeSelector: string, baseRef: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitPullRebaseFromBase(target.worktree.path, baseRef, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async pushRuntimeGit(
    worktreeSelector: string,
    publish?: boolean,
    pushTarget?: GitPushTarget,
    forceWithLease?: boolean
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitPush(target.worktree.path, publish === true, pushTarget, {
      forceWithLease: forceWithLease === true,
      ...localGitOptionsForTarget(target)
    })
    return { ok: true }
  }
}
