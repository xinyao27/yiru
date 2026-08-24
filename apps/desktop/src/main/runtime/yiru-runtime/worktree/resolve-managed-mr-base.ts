import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import { gitExecFileAsync } from '~main/git/runner'
import {
  getProjectRefForRemote as getGitLabProjectRefForRemote,
  getWorkItemByProjectRef as getGitLabWorkItemByProjectRef
} from '~main/gitlab/client'
import { getGlabKnownHosts } from '~main/gitlab/gitlab-cli'
import {
  getLocalProjectGitExecOptions,
  getLocalProjectWorktreeGitOptions
} from '~main/project-runtime-git-options'
import { isFolderRepo } from '~shared/repo-kind'
import type { GitPushTarget, Repo } from '~shared/types'

import { RuntimeWorktreeProbeWorktreeDrift } from './probe-worktree-drift'

export abstract class RuntimeWorktreeResolveManagedMrBase extends RuntimeWorktreeProbeWorktreeDrift {
  async resolveManagedMrBase(args: {
    repoSelector: string
    executionHostId?: ExecutionHostId
    mrIid: number
    sourceBranch?: string
    targetBranch?: string
    isCrossRepository?: boolean
  }): Promise<
    { baseBranch: string; compareBaseRef?: string; pushTarget?: GitPushTarget } | { error: string }
  > {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    let repo: Repo
    try {
      repo = await this.resolveRepoSelector(args.repoSelector, args.executionHostId)
    } catch {
      return { error: 'Repo not found' }
    }
    if (isFolderRepo(repo)) {
      return { error: 'Folder mode does not support creating worktrees.' }
    }
    const localGitExecOptions = getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const gitExec = (gitArgs: string[]) => gitExecFileAsync(gitArgs, localGitExecOptions)

    let sourceBranch = args.sourceBranch?.trim() ?? ''
    let targetBranch = args.targetBranch?.trim() ?? ''
    let isCrossRepository = args.isCrossRepository === true

    if (!sourceBranch) {
      let remote: string
      try {
        remote = await this.resolveGitLabProjectRemote(
          repo.path,
          repo.forgeRemotePreference,
          localWorktreeGitOptions
        )
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Could not resolve git remote.' }
      }
      const knownHosts = await getGlabKnownHosts(null)
      const projectRef = await getGitLabProjectRefForRemote(
        repo.path,
        remote,
        knownHosts,
        null,
        localWorktreeGitOptions
      )
      if (!projectRef) {
        return { error: 'No GitLab project found for this repository.' }
      }
      const item = await getGitLabWorkItemByProjectRef(
        repo.path,
        projectRef,
        args.mrIid,
        'mr',
        null,
        localWorktreeGitOptions
      )
      if (!item || item.type !== 'mr') {
        return { error: `MR !${args.mrIid} not found.` }
      }
      sourceBranch = (item.branchName ?? '').trim()
      targetBranch = (item.baseRefName ?? '').trim()
      if (!sourceBranch) {
        return { error: `MR !${args.mrIid} has no source branch.` }
      }
      if (item.isCrossRepository === true) {
        isCrossRepository = true
      }
    }

    let remote: string
    try {
      remote = await this.resolveGitLabProjectRemote(
        repo.path,
        repo.forgeRemotePreference,
        localWorktreeGitOptions
      )
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not resolve git remote.' }
    }
    const compareBaseRef = targetBranch ? `refs/remotes/${remote}/${targetBranch}` : undefined
    const fetchRemoteTrackingRef = async (branch: string, ref: string): Promise<void> => {
      await gitExec(['fetch', remote, `+refs/heads/${branch}:${ref}`])
    }
    // Why: the target/compare branch is optional (it only powers the diff
    // base). A merged MR may have had its target ref deleted, so a fetch
    // failure must NOT abort the whole resolution — that would discard the
    // already-verified source-branch base and silently fall back to the repo
    // default branch. Degrade gracefully by dropping compareBaseRef instead.
    const fetchCompareBaseRef = async (): Promise<boolean> => {
      if (!targetBranch || !compareBaseRef) {
        return false
      }
      try {
        await fetchRemoteTrackingRef(targetBranch, compareBaseRef)
        return true
      } catch (error) {
        console.warn('[runtime:resolveManagedMrBase] optional compare-base fetch failed', {
          remote,
          targetBranch,
          mrIid: args.mrIid,
          error: error instanceof Error ? error.message.split('\n')[0] : String(error)
        })
        return false
      }
    }

    if (isCrossRepository) {
      const mrRef = `refs/merge-requests/${args.mrIid}/head`
      // Why: GitLab exposes fork MR heads on the target project, so mobile
      // can match desktop without adding the contributor fork as a remote.
      try {
        await gitExec(['fetch', remote, mrRef])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { error: `Failed to fetch ${mrRef}: ${message.split('\n')[0]}` }
      }
      let sha: string
      try {
        const { stdout } = await gitExec(['rev-parse', '--verify', 'FETCH_HEAD'])
        sha = stdout.trim()
      } catch {
        return { error: `Could not resolve fork MR !${args.mrIid} head after fetch.` }
      }
      if (!sha) {
        return { error: `Empty SHA resolving fork MR !${args.mrIid} head.` }
      }
      const compareBaseFetched = await fetchCompareBaseRef()
      return { baseBranch: sha, ...(compareBaseFetched ? { compareBaseRef } : {}) }
    }

    try {
      await fetchRemoteTrackingRef(sourceBranch, `refs/remotes/${remote}/${sourceBranch}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { error: `Failed to fetch ${remote}/${sourceBranch}: ${message.split('\n')[0]}` }
    }

    const remoteRef = `${remote}/${sourceBranch}`
    try {
      await gitExec(['rev-parse', '--verify', remoteRef])
    } catch {
      return { error: `Remote ref ${remoteRef} does not exist after fetch.` }
    }
    const compareBaseFetched = await fetchCompareBaseRef()
    return {
      baseBranch: remoteRef,
      ...(compareBaseFetched ? { compareBaseRef } : {}),
      pushTarget: { remoteName: remote, branchName: sourceBranch }
    }
  }
}
