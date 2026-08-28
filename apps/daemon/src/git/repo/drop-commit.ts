import type { GitDropCommitResult } from '@yiru/runtime-protocol/workbench/git/write-op-results'
import {
  countCommitParents,
  isWorkingTreeDirty,
  readCurrentBranchName,
  resolveCommitOid,
  runConflictableGitOp
} from '~main/git/status/write-preconditions'

import { gitExecFileAsync } from '../runner/runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../runner/runtime-options'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from '../status/status'

/**
 * Remove a commit from the current branch via `git rebase --onto <commit>^
 * <commit>`. Refuses a merge commit outright — replaying "everything after a
 * merge, rebased onto one of its parents" is not a meaningful "drop" and git
 * itself would silently pick one parent's history, discarding the other side.
 */
export async function dropCommit(
  worktreePath: string,
  params: { commit: string },
  options: GitRuntimeOptions = {}
): Promise<GitDropCommitResult> {
  const run = (args: string[]): Promise<{ stdout: string }> =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  const { commit } = params

  if ((await detectConflictOperation(worktreePath)) !== 'unknown') {
    return {
      status: 'blocked',
      reason: 'operation_in_progress',
      message: 'A merge, rebase, cherry-pick, or revert is already in progress in this worktree.'
    }
  }
  if ((await readCurrentBranchName(run)) === null) {
    return {
      status: 'blocked',
      reason: 'detached_head',
      message: 'Check out a branch before dropping a commit — HEAD is currently detached.'
    }
  }
  if (await isWorkingTreeDirty(run)) {
    return {
      status: 'blocked',
      reason: 'dirty_working_tree',
      message: 'Commit or discard your changes before dropping a commit.'
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
  const parentCount = await countCommitParents(run, commitOid)
  if (parentCount >= 2) {
    return {
      status: 'blocked',
      reason: 'merge_commit_not_droppable',
      message:
        'This is a merge commit — dropping it this way would silently discard one parent history.'
    }
  }
  if (parentCount === 0) {
    return {
      status: 'blocked',
      reason: 'invalid_commit',
      message: "This is the repository's first commit — it has no parent to rebase onto."
    }
  }

  return runWithGitReadCacheInvalidation(() =>
    runConflictableGitOp({
      run,
      args: ['rebase', '--onto', `${commitOid}^`, commitOid],
      detectConflictOperation: () => detectConflictOperation(worktreePath),
      expectedOperation: 'rebase'
    })
  )
}
