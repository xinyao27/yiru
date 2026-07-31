import type { GitCheckoutCommitResult } from '~shared/git/write-op-results'
import { isWorkingTreeDirty, resolveCommitOid } from '~shared/git/write-preconditions'

import { gitExecFileAsync } from './runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './runtime-options'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from './status'

/**
 * Detach HEAD at a commit (`git checkout <oid> --`). Refuses a dirty working
 * tree or an in-progress merge/rebase/cherry-pick/revert rather than letting
 * git's own "would be overwritten by checkout" error surface unexplained.
 */
export async function checkoutCommit(
  worktreePath: string,
  commit: string,
  options: GitRuntimeOptions = {}
): Promise<GitCheckoutCommitResult> {
  const run = (args: string[]): Promise<{ stdout: string }> =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))

  if ((await detectConflictOperation(worktreePath)) !== 'unknown') {
    return {
      status: 'blocked',
      reason: 'operation_in_progress',
      message: 'A merge, rebase, cherry-pick, or revert is already in progress in this worktree.'
    }
  }
  if (await isWorkingTreeDirty(run)) {
    return {
      status: 'blocked',
      reason: 'dirty_working_tree',
      message: 'Commit or discard your changes before checking out a different commit.'
    }
  }
  const commitOid = await resolveCommitOid(run, commit)
  if (!commitOid) {
    return {
      status: 'blocked',
      reason: 'invalid_commit',
      message: `${commit} does not name a commit in this repository.`
    }
  }
  try {
    await runWithGitReadCacheInvalidation(() => run(['checkout', commitOid, '--']))
    return { status: 'ok', commit: commitOid }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
