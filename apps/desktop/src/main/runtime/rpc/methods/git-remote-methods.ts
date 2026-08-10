import type {
  GitForkSyncInputSchema,
  GitPushInputSchema,
  GitRebaseFromBaseInputSchema,
  GitTargetedRemoteInputSchema
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'

import type { RpcContext } from '../core'

export const handleGitUpstreamStatus = (
  params: z.infer<typeof GitTargetedRemoteInputSchema>,
  { gitCommands }: RpcContext
) =>
  params.pushTarget === undefined
    ? gitCommands.getRuntimeGitUpstreamStatus(params.worktree)
    : gitCommands.getRuntimeGitUpstreamStatus(params.worktree, params.pushTarget)

export const handleGitFetch = (
  params: z.infer<typeof GitTargetedRemoteInputSchema>,
  { gitCommands }: RpcContext
) =>
  params.pushTarget === undefined
    ? gitCommands.fetchRuntimeGit(params.worktree)
    : gitCommands.fetchRuntimeGit(params.worktree, params.pushTarget)

export const handleGitForkSync = (
  params: z.infer<typeof GitForkSyncInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.syncRuntimeGitForkDefaultBranch(params.worktree, params.expectedUpstream)

export const handleGitPull = (
  params: z.infer<typeof GitTargetedRemoteInputSchema>,
  { gitCommands }: RpcContext
) =>
  params.pushTarget === undefined
    ? gitCommands.pullRuntimeGit(params.worktree)
    : gitCommands.pullRuntimeGit(params.worktree, params.pushTarget)

export const handleGitFastForward = (
  params: z.infer<typeof GitTargetedRemoteInputSchema>,
  { gitCommands }: RpcContext
) =>
  params.pushTarget === undefined
    ? gitCommands.fastForwardRuntimeGit(params.worktree)
    : gitCommands.fastForwardRuntimeGit(params.worktree, params.pushTarget)

export const handleGitRebaseFromBase = (
  params: z.infer<typeof GitRebaseFromBaseInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.rebaseRuntimeGitFromBase(params.worktree, params.baseRef)

export const handleGitPush = (
  params: z.infer<typeof GitPushInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.pushRuntimeGit(
    params.worktree,
    params.publish,
    params.pushTarget,
    params.forceWithLease
  )
