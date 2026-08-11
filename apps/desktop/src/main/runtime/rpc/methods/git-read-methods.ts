import type {
  GitBranchCompareInputSchema,
  GitBranchDiffInputSchema,
  GitCheckIgnoredInputSchema,
  GitCommitCompareInputSchema,
  GitCommitDiffInputSchema,
  GitDiffInputSchema,
  GitHistoryInputSchema,
  GitRemoteCommitUrlInputSchema,
  GitRemoteFileUrlInputSchema,
  GitStatusInputSchema,
  GitSubmoduleStatusInputSchema,
  GitWorktreeSelectorInputSchema
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'

import type { RpcContext } from '../core'

export const handleGitStatus = async (
  params: z.infer<typeof GitStatusInputSchema>,
  { gitCommands, signal }: RpcContext
) => {
  const options =
    params.includeIgnored === undefined &&
    params.bypassEffectiveUpstreamNegativeCache === undefined &&
    params.reuseLineStats === undefined &&
    signal === undefined
      ? undefined
      : {
          ...(params.includeIgnored === undefined ? {} : { includeIgnored: params.includeIgnored }),
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

export const handleGitCheckIgnored = (
  params: z.infer<typeof GitCheckIgnoredInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.checkRuntimeGitIgnoredPaths(params.worktree, params.paths)

export const handleGitFindHugeFoldersToIgnore = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.findRuntimeGitHugeFoldersToIgnore(params.worktree)

export const handleGitSubmoduleStatus = (
  params: z.infer<typeof GitSubmoduleStatusInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.getRuntimeGitSubmoduleStatus(params.worktree, params.submodulePath, params.area)

export const handleGitHistory = (
  params: z.infer<typeof GitHistoryInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.getRuntimeGitHistory(params.worktree, {
    limit: params.limit,
    baseRef: params.baseRef,
    refScope: params.refScope,
    includeRemoteBranches: params.includeRemoteBranches,
    skip: params.skip
  })

export const handleGitConflictOperation = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.getRuntimeGitConflictOperation(params.worktree)

export const handleGitLocalBranches = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.listRuntimeGitLocalBranches(params.worktree)

export const handleGitDiff = (
  params: z.infer<typeof GitDiffInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.getRuntimeGitDiff(
    params.worktree,
    params.filePath,
    params.staged,
    params.compareAgainstHead
  )

export const handleGitBranchCompare = (
  params: z.infer<typeof GitBranchCompareInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.getRuntimeGitBranchCompare(params.worktree, params.baseRef)

export const handleGitCommitCompare = (
  params: z.infer<typeof GitCommitCompareInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.getRuntimeGitCommitCompare(params.worktree, params.commitId)

export const handleGitBranchDiff = (
  params: z.infer<typeof GitBranchDiffInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.getRuntimeGitBranchDiff(
    params.worktree,
    params.compare,
    params.filePath,
    params.oldPath
  )

export const handleGitCommitDiff = (
  params: z.infer<typeof GitCommitDiffInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.getRuntimeGitCommitDiff(params.worktree, {
    commitOid: params.commitOid,
    parentOid: params.parentOid,
    filePath: params.filePath,
    oldPath: params.oldPath
  })

export const handleGitRemoteFileUrl = (
  params: z.infer<typeof GitRemoteFileUrlInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.getRuntimeGitRemoteFileUrl(params.worktree, params.relativePath, params.line)

export const handleGitRemoteCommitUrl = (
  params: z.infer<typeof GitRemoteCommitUrlInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.getRuntimeGitRemoteCommitUrl(params.worktree, params.sha)
