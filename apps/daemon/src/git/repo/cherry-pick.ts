import type { GitCherryPickResult } from '@yiru/runtime-protocol/workbench/git/write-op-results'
import {
  countCommitParents,
  isWorkingTreeDirty,
  resolveCommitOid,
  runConflictableGitOp,
  validateMainlineOption
} from '~main/git/status/write-preconditions'

import { gitExecFileAsync } from '../runner/runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../runner/runtime-options'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from '../status/status'

/**
 * Cherry-pick a commit onto the current branch. `-m <mainline>` is required
 * when the commit is a merge commit; `--no-edit` keeps the picked commit
 * message as-is so no editor is ever launched.
 */
export async function cherryPickCommit(
  worktreePath: string,
  params: { commit: string; mainline?: number },
  options: GitRuntimeOptions = {}
): Promise<GitCherryPickResult> {
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
      message: 'Commit or discard your changes before cherry-picking.'
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

  const args = [
    'cherry-pick',
    '--no-edit',
    ...(mainline ? ['-m', String(mainline)] : []),
    commitOid
  ]
  return runWithGitReadCacheInvalidation(() =>
    runConflictableGitOp({
      run,
      args,
      detectConflictOperation: () => detectConflictOperation(worktreePath),
      expectedOperation: 'cherry-pick'
    })
  )
}
