import type { GitRebaseOntoCommitResult } from '../../shared/git/write-op-results'
import {
  isWorkingTreeDirty,
  readCurrentBranchName,
  resolveCommitOid,
  runConflictableGitOp
} from '../../shared/git/write-preconditions'
import { gitExecFileAsync } from './runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './runtime-options'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from './status'

/**
 * Rebase the current branch onto a commit (`git rebase <commit>`), always
 * non-interactive. An interactive rebase needs a todo-list editor UI this
 * backend does not have; wiring `-i` without one would leave `git rebase`
 * blocked on `$EDITOR` indefinitely on a remote/relay host. Only the
 * non-interactive form is implemented — there is deliberately no
 * `interactive` option to request the other path.
 */
export async function rebaseOntoCommit(
  worktreePath: string,
  params: { commit: string },
  options: GitRuntimeOptions = {}
): Promise<GitRebaseOntoCommitResult> {
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
      message: 'Check out a branch before rebasing — HEAD is currently detached.'
    }
  }
  if (await isWorkingTreeDirty(run)) {
    return {
      status: 'blocked',
      reason: 'dirty_working_tree',
      message: 'Commit or discard your changes before rebasing.'
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

  return runWithGitReadCacheInvalidation(() =>
    runConflictableGitOp({
      run,
      args: ['rebase', commitOid],
      detectConflictOperation: () => detectConflictOperation(worktreePath),
      expectedOperation: 'rebase'
    })
  )
}
