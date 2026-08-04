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
} from '~shared/git/write-op-results'

/**
 * The nine commit-graph write operations (tag, create-branch,
 * checkout-commit, cherry-pick, revert, drop, merge, rebase-onto-commit,
 * reset), plus `abortRevert`. Split out of `IGitProvider` in
 * `providers/types.ts` purely to stay under the 300-line file budget.
 */
export type IGitWriteOpsProvider = {
  abortRevert(worktreePath: string): Promise<void>
  addTag(
    worktreePath: string,
    params: { name: string; commit: string; message?: string; force?: boolean }
  ): Promise<GitAddTagResult>
  createBranchFromCommit(
    worktreePath: string,
    params: { name: string; commit: string; checkout?: boolean }
  ): Promise<GitCreateBranchResult>
  checkoutCommit(worktreePath: string, commit: string): Promise<GitCheckoutCommitResult>
  cherryPickCommit(
    worktreePath: string,
    params: { commit: string; mainline?: number }
  ): Promise<GitCherryPickResult>
  revertCommit(
    worktreePath: string,
    params: { commit: string; mainline?: number }
  ): Promise<GitRevertResult>
  dropCommit(worktreePath: string, params: { commit: string }): Promise<GitDropCommitResult>
  mergeCommit(
    worktreePath: string,
    params: { commit: string; noFf?: boolean; squash?: boolean; message?: string }
  ): Promise<GitMergeCommitResult>
  rebaseOntoCommit(
    worktreePath: string,
    params: { commit: string }
  ): Promise<GitRebaseOntoCommitResult>
  resetToCommit(
    worktreePath: string,
    params: { commit: string; mode: 'soft' | 'mixed' | 'hard' }
  ): Promise<GitResetToCommitResult>
}
