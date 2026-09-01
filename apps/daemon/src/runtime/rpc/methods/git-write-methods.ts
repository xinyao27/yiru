import type {
  GitAppendGitignoreInputSchema,
  GitAddTagInputSchema,
  GitCheckoutCommitInputSchema,
  GitCheckoutInputSchema,
  GitCherryPickInputSchema,
  GitCommitInputSchema,
  GitCreateBranchInputSchema,
  GitDropCommitInputSchema,
  GitMergeCommitInputSchema,
  GitRebaseOntoCommitInputSchema,
  GitResetToCommitInputSchema,
  GitRevertCommitInputSchema,
  GitWorktreeSelectorInputSchema
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'

import type { RpcContext } from '../core'

export const handleGitAbortMerge = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.abortRuntimeGitMerge(params.worktree)

export const handleGitAppendGitignore = (
  params: z.infer<typeof GitAppendGitignoreInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.appendRuntimeGitignore(params.worktree, params.folderName)

export const handleGitAbortRebase = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.abortRuntimeGitRebase(params.worktree)

export const handleGitAbortRevert = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.abortRuntimeGitRevert(params.worktree)

export const handleGitAddTag = (
  params: z.infer<typeof GitAddTagInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.addRuntimeGitTag(params.worktree, {
    name: params.name,
    commit: params.commit,
    message: params.message,
    force: params.force
  })

export const handleGitCreateBranch = (
  params: z.infer<typeof GitCreateBranchInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.createRuntimeGitBranchFromCommit(params.worktree, {
    name: params.name,
    commit: params.commit,
    checkout: params.checkout
  })

export const handleGitCheckoutCommit = (
  params: z.infer<typeof GitCheckoutCommitInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.checkoutRuntimeGitCommit(params.worktree, params.commit)

export const handleGitCherryPick = (
  params: z.infer<typeof GitCherryPickInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.cherryPickRuntimeGitCommit(params.worktree, {
    commit: params.commit,
    mainline: params.mainline
  })

export const handleGitRevertCommit = (
  params: z.infer<typeof GitRevertCommitInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.revertRuntimeGitCommit(params.worktree, {
    commit: params.commit,
    mainline: params.mainline
  })

export const handleGitDropCommit = (
  params: z.infer<typeof GitDropCommitInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.dropRuntimeGitCommit(params.worktree, { commit: params.commit })

export const handleGitMergeCommit = (
  params: z.infer<typeof GitMergeCommitInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.mergeRuntimeGitCommit(params.worktree, {
    commit: params.commit,
    noFf: params.noFf,
    squash: params.squash,
    message: params.message
  })

export const handleGitRebaseOntoCommit = (
  params: z.infer<typeof GitRebaseOntoCommitInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.rebaseRuntimeGitOntoCommit(params.worktree, { commit: params.commit })

export const handleGitResetToCommit = (
  params: z.infer<typeof GitResetToCommitInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.resetRuntimeGitToCommit(params.worktree, {
    commit: params.commit,
    mode: params.mode
  })

export const handleGitCheckout = (
  params: z.infer<typeof GitCheckoutInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.checkoutRuntimeGitBranch(params.worktree, params.branch)

export const handleGitCommit = (
  params: z.infer<typeof GitCommitInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.commitRuntimeGit(params.worktree, params.message)
