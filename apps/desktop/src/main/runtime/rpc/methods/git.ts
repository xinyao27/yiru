import type { ResolvedSourceControlAiGenerationParams } from '../../../../shared/source-control-ai'
import type { GlobalSettings } from '../../../../shared/types'
/* eslint-disable max-lines -- Why: this table is the runtime git RPC contract; splitting it would make method coverage harder to audit. */
import { defineMethod, type RpcMethod } from '../core'
import {
  GitBranchCompare,
  GitBranchDiff,
  GitBulkPaths,
  GitCheckIgnored,
  GitCheckout,
  GitCommit,
  GitCommitCompare,
  GitCommitDiff,
  GitDiscoverCommitMessageModels,
  GitDiff,
  GitFilePath,
  GitForkSync,
  GitGenerateCommitMessage,
  GitGeneratePullRequestFields,
  GitHistory,
  GitPush,
  GitRebaseFromBase,
  GitRemoteCommitUrl,
  GitRemoteFileUrl,
  GitStatusParams,
  GitSubmoduleStatus,
  GitTargetedRemote,
  WorktreeSelector
} from './git-params'

type CommitMessageGenerationOverride = {
  commitMessageAi?: GlobalSettings['commitMessageAi']
  sourceControlAi?: GlobalSettings['sourceControlAi']
  sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
  agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
  enableGitHubAttribution?: boolean
  commitMessageDiscoveryHostKey?: string
}

// Why: generateCommitMessage and generatePullRequestFields share the same optional
// override fields; returning undefined when none are set keeps the no-override call path.
function buildCommitMessageGenerationOverride(params: {
  commitMessageAi?: unknown
  sourceControlAi?: unknown
  sourceControlAiResolvedParams?: unknown
  agentCmdOverrides?: unknown
  enableGitHubAttribution?: boolean
  commitMessageDiscoveryHostKey?: string
}): CommitMessageGenerationOverride | undefined {
  if (
    params.commitMessageAi === undefined &&
    params.sourceControlAi === undefined &&
    params.sourceControlAiResolvedParams === undefined &&
    params.agentCmdOverrides === undefined &&
    params.enableGitHubAttribution === undefined &&
    params.commitMessageDiscoveryHostKey === undefined
  ) {
    return undefined
  }
  return {
    ...(params.commitMessageAi !== undefined
      ? { commitMessageAi: params.commitMessageAi as GlobalSettings['commitMessageAi'] }
      : {}),
    ...(params.sourceControlAi !== undefined
      ? { sourceControlAi: params.sourceControlAi as GlobalSettings['sourceControlAi'] }
      : {}),
    ...(params.sourceControlAiResolvedParams !== undefined
      ? {
          sourceControlAiResolvedParams:
            params.sourceControlAiResolvedParams as ResolvedSourceControlAiGenerationParams
        }
      : {}),
    ...(params.agentCmdOverrides !== undefined
      ? {
          agentCmdOverrides: params.agentCmdOverrides as GlobalSettings['agentCmdOverrides']
        }
      : {}),
    ...(params.enableGitHubAttribution !== undefined
      ? { enableGitHubAttribution: params.enableGitHubAttribution }
      : {}),
    ...(params.commitMessageDiscoveryHostKey !== undefined
      ? { commitMessageDiscoveryHostKey: params.commitMessageDiscoveryHostKey }
      : {})
  }
}

export const GIT_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'git.status',
    params: GitStatusParams,
    handler: async (params, { gitCommands, signal }) => {
      const options =
        params.includeIgnored === undefined &&
        params.bypassEffectiveUpstreamNegativeCache === undefined &&
        params.reuseLineStats === undefined &&
        signal === undefined
          ? undefined
          : {
              ...(params.includeIgnored === undefined
                ? {}
                : { includeIgnored: params.includeIgnored }),
              ...(params.bypassEffectiveUpstreamNegativeCache === true
                ? { bypassEffectiveUpstreamNegativeCache: true }
                : {}),
              ...(params.reuseLineStats === true ? { reuseLineStats: true } : {}),
              ...(signal ? { signal } : {})
            }
      return options === undefined
        ? gitCommands.getRuntimeGitStatus(params.worktree)
        : gitCommands.getRuntimeGitStatus(params.worktree, options)
    }
  }),
  defineMethod({
    name: 'git.checkIgnored',
    params: GitCheckIgnored,
    handler: async (params, { gitCommands }) =>
      gitCommands.checkRuntimeGitIgnoredPaths(params.worktree, params.paths)
  }),
  defineMethod({
    name: 'git.submoduleStatus',
    params: GitSubmoduleStatus,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitSubmoduleStatus(params.worktree, params.submodulePath, params.area)
  }),
  defineMethod({
    name: 'git.history',
    params: GitHistory,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitHistory(params.worktree, {
        limit: params.limit,
        baseRef: params.baseRef
      })
  }),
  defineMethod({
    name: 'git.conflictOperation',
    params: WorktreeSelector,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitConflictOperation(params.worktree)
  }),
  defineMethod({
    name: 'git.abortMerge',
    params: WorktreeSelector,
    handler: async (params, { gitCommands }) => gitCommands.abortRuntimeGitMerge(params.worktree)
  }),
  defineMethod({
    name: 'git.abortRebase',
    params: WorktreeSelector,
    handler: async (params, { gitCommands }) => gitCommands.abortRuntimeGitRebase(params.worktree)
  }),
  defineMethod({
    name: 'git.checkout',
    params: GitCheckout,
    handler: async (params, { gitCommands }) =>
      gitCommands.checkoutRuntimeGitBranch(params.worktree, params.branch)
  }),
  defineMethod({
    name: 'git.localBranches',
    params: WorktreeSelector,
    handler: async (params, { gitCommands }) =>
      gitCommands.listRuntimeGitLocalBranches(params.worktree)
  }),
  defineMethod({
    name: 'git.diff',
    params: GitDiff,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitDiff(
        params.worktree,
        params.filePath,
        params.staged,
        params.compareAgainstHead
      )
  }),
  defineMethod({
    name: 'git.branchCompare',
    params: GitBranchCompare,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitBranchCompare(params.worktree, params.baseRef)
  }),
  defineMethod({
    name: 'git.commitCompare',
    params: GitCommitCompare,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitCommitCompare(params.worktree, params.commitId)
  }),
  defineMethod({
    name: 'git.upstreamStatus',
    params: GitTargetedRemote,
    handler: async (params, { gitCommands }) =>
      params.pushTarget === undefined
        ? gitCommands.getRuntimeGitUpstreamStatus(params.worktree)
        : gitCommands.getRuntimeGitUpstreamStatus(params.worktree, params.pushTarget)
  }),
  defineMethod({
    name: 'git.fetch',
    params: GitTargetedRemote,
    handler: async (params, { gitCommands }) =>
      params.pushTarget === undefined
        ? gitCommands.fetchRuntimeGit(params.worktree)
        : gitCommands.fetchRuntimeGit(params.worktree, params.pushTarget)
  }),
  defineMethod({
    name: 'git.forkSync',
    params: GitForkSync,
    handler: async (params, { gitCommands }) =>
      gitCommands.syncRuntimeGitForkDefaultBranch(params.worktree, params.expectedUpstream)
  }),
  defineMethod({
    name: 'git.pull',
    params: GitTargetedRemote,
    handler: async (params, { gitCommands }) =>
      params.pushTarget === undefined
        ? gitCommands.pullRuntimeGit(params.worktree)
        : gitCommands.pullRuntimeGit(params.worktree, params.pushTarget)
  }),
  defineMethod({
    name: 'git.fastForward',
    params: GitTargetedRemote,
    handler: async (params, { gitCommands }) =>
      params.pushTarget === undefined
        ? gitCommands.fastForwardRuntimeGit(params.worktree)
        : gitCommands.fastForwardRuntimeGit(params.worktree, params.pushTarget)
  }),
  defineMethod({
    name: 'git.rebaseFromBase',
    params: GitRebaseFromBase,
    handler: async (params, { gitCommands }) =>
      gitCommands.rebaseRuntimeGitFromBase(params.worktree, params.baseRef)
  }),
  defineMethod({
    name: 'git.push',
    params: GitPush,
    handler: async (params, { gitCommands }) =>
      gitCommands.pushRuntimeGit(
        params.worktree,
        params.publish,
        params.pushTarget,
        params.forceWithLease
      )
  }),
  defineMethod({
    name: 'git.branchDiff',
    params: GitBranchDiff,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitBranchDiff(
        params.worktree,
        params.compare,
        params.filePath,
        params.oldPath
      )
  }),
  defineMethod({
    name: 'git.commitDiff',
    params: GitCommitDiff,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitCommitDiff(params.worktree, {
        commitOid: params.commitOid,
        parentOid: params.parentOid,
        filePath: params.filePath,
        oldPath: params.oldPath
      })
  }),
  defineMethod({
    name: 'git.commit',
    params: GitCommit,
    handler: async (params, { gitCommands }) =>
      gitCommands.commitRuntimeGit(params.worktree, params.message)
  }),
  defineMethod({
    name: 'git.generateCommitMessage',
    params: GitGenerateCommitMessage,
    handler: async (params, { gitCommands }) => {
      const override = buildCommitMessageGenerationOverride(params)
      if (override === undefined) {
        return gitCommands.generateRuntimeCommitMessage(params.worktree)
      }
      return gitCommands.generateRuntimeCommitMessage(params.worktree, override)
    }
  }),
  defineMethod({
    name: 'git.discoverCommitMessageModels',
    params: GitDiscoverCommitMessageModels,
    handler: async (params, { gitCommands }) =>
      gitCommands.discoverRuntimeCommitMessageModels(
        params.worktree,
        params.agentId,
        params.agentCmdOverrides !== undefined
          ? {
              agentCmdOverrides: params.agentCmdOverrides as GlobalSettings['agentCmdOverrides']
            }
          : {}
      )
  }),
  defineMethod({
    name: 'git.cancelGenerateCommitMessage',
    params: WorktreeSelector,
    handler: async (params, { gitCommands }) =>
      gitCommands.cancelRuntimeGenerateCommitMessage(params.worktree)
  }),
  defineMethod({
    name: 'git.generatePullRequestFields',
    params: GitGeneratePullRequestFields,
    handler: async (params, { gitCommands }) => {
      const input = {
        base: params.base,
        title: params.title,
        body: params.body,
        draft: params.draft,
        provider: params.provider,
        useTemplate: params.useTemplate
      }
      const override = buildCommitMessageGenerationOverride(params)
      if (override === undefined) {
        return gitCommands.generateRuntimePullRequestFields(params.worktree, input)
      }
      return gitCommands.generateRuntimePullRequestFields(params.worktree, input, override)
    }
  }),
  defineMethod({
    name: 'git.cancelGeneratePullRequestFields',
    params: WorktreeSelector,
    handler: async (params, { gitCommands }) =>
      gitCommands.cancelRuntimeGeneratePullRequestFields(params.worktree)
  }),
  defineMethod({
    name: 'git.stage',
    params: GitFilePath,
    handler: async (params, { gitCommands }) =>
      gitCommands.stageRuntimeGitPath(params.worktree, params.filePath)
  }),
  defineMethod({
    name: 'git.bulkStage',
    params: GitBulkPaths,
    handler: async (params, { gitCommands }) =>
      gitCommands.bulkStageRuntimeGitPaths(params.worktree, params.filePaths)
  }),
  defineMethod({
    name: 'git.unstage',
    params: GitFilePath,
    handler: async (params, { gitCommands }) =>
      gitCommands.unstageRuntimeGitPath(params.worktree, params.filePath)
  }),
  defineMethod({
    name: 'git.bulkUnstage',
    params: GitBulkPaths,
    handler: async (params, { gitCommands }) =>
      gitCommands.bulkUnstageRuntimeGitPaths(params.worktree, params.filePaths)
  }),
  defineMethod({
    name: 'git.discard',
    params: GitFilePath,
    handler: async (params, { gitCommands }) =>
      gitCommands.discardRuntimeGitPath(params.worktree, params.filePath)
  }),
  defineMethod({
    name: 'git.bulkDiscard',
    params: GitBulkPaths,
    handler: async (params, { gitCommands }) =>
      gitCommands.bulkDiscardRuntimeGitPaths(params.worktree, params.filePaths)
  }),
  defineMethod({
    name: 'git.remoteFileUrl',
    params: GitRemoteFileUrl,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitRemoteFileUrl(params.worktree, params.relativePath, params.line)
  }),
  defineMethod({
    name: 'git.remoteCommitUrl',
    params: GitRemoteCommitUrl,
    handler: async (params, { gitCommands }) =>
      gitCommands.getRuntimeGitRemoteCommitUrl(params.worktree, params.sha)
  })
]
