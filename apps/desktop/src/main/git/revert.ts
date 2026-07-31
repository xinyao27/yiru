import type { GitRevertResult } from '../../shared/git/write-op-results'
import {
  countCommitParents,
  isWorkingTreeDirty,
  resolveCommitOid,
  runConflictableGitOp,
  validateMainlineOption
} from '../../shared/git/write-preconditions'
import { gitExecFileAsync } from './runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './runtime-options'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from './status'

/**
 * Revert a commit on the current branch. `-m <mainline>` is required when the
 * commit is a merge commit; `--no-edit` keeps git's default revert message so
 * no editor is ever launched.
 */
export async function revertCommit(
  worktreePath: string,
  params: { commit: string; mainline?: number },
  options: GitRuntimeOptions = {}
): Promise<GitRevertResult> {
  const run = (args: string[]): Promise<{ stdout: string }> =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  const { commit, mainline } = params

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
      message: 'Commit or discard your changes before reverting.'
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
  const mainlineCheck = validateMainlineOption(parentCount, mainline)
  if (!mainlineCheck.ok) {
    return { status: 'blocked', reason: mainlineCheck.reason, message: mainlineCheck.message }
  }

  const args = ['revert', '--no-edit', ...(mainline ? ['-m', String(mainline)] : []), commitOid]
  return runWithGitReadCacheInvalidation(() =>
    runConflictableGitOp({
      run,
      args,
      detectConflictOperation: () => detectConflictOperation(worktreePath),
      expectedOperation: 'revert'
    })
  )
}
