import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCherryPickResult,
  GitCreateBranchResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitResetToCommitResult,
  GitRevertResult
} from '@yiru/runtime-protocol/workbench/git/write-op-results'

import { callRuntimeOrpc } from '../orpc-client'
import { getRuntimeGitTarget, getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function abortRuntimeGitMerge(context: RuntimeGitContext): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.abortMerge,
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 30_000 }
  )
}

export async function abortRuntimeGitRebase(context: RuntimeGitContext): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.abortRebase,
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 30_000 }
  )
}

export async function abortRuntimeGitRevert(context: RuntimeGitContext): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.abortRevert,
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 30_000 }
  )
}

export async function addRuntimeGitTag(
  context: RuntimeGitContext,
  args: { name: string; commit: string; message?: string; force?: boolean }
): Promise<GitAddTagResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.addTag,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 30_000 }
  )
}

export async function createRuntimeGitBranchFromCommit(
  context: RuntimeGitContext,
  args: { name: string; commit: string; checkout?: boolean }
): Promise<GitCreateBranchResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.createBranch,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 30_000 }
  )
}

export async function checkoutRuntimeGitCommit(
  context: RuntimeGitContext,
  commit: string
): Promise<GitCheckoutCommitResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.checkoutCommit,
    { worktree: getRuntimeGitWorktree(context), commit },
    { timeoutMs: 30_000 }
  )
}

export async function cherryPickRuntimeGitCommit(
  context: RuntimeGitContext,
  args: { commit: string; mainline?: number }
): Promise<GitCherryPickResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.cherryPick,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 60_000 }
  )
}

export async function revertRuntimeGitCommit(
  context: RuntimeGitContext,
  args: { commit: string; mainline?: number }
): Promise<GitRevertResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.revertCommit,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 60_000 }
  )
}

export async function dropRuntimeGitCommit(
  context: RuntimeGitContext,
  commit: string
): Promise<GitDropCommitResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.dropCommit,
    { worktree: getRuntimeGitWorktree(context), commit },
    { timeoutMs: 60_000 }
  )
}

export async function mergeRuntimeGitCommit(
  context: RuntimeGitContext,
  args: { commit: string; noFf?: boolean; squash?: boolean; message?: string }
): Promise<GitMergeCommitResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.mergeCommit,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 60_000 }
  )
}

export async function rebaseRuntimeGitOntoCommit(
  context: RuntimeGitContext,
  commit: string
): Promise<GitRebaseOntoCommitResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.rebaseOntoCommit,
    { worktree: getRuntimeGitWorktree(context), commit },
    { timeoutMs: 60_000 }
  )
}

export async function resetRuntimeGitToCommit(
  context: RuntimeGitContext,
  args: { commit: string; mode: 'soft' | 'mixed' | 'hard' }
): Promise<GitResetToCommitResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.resetToCommit,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 30_000 }
  )
}
