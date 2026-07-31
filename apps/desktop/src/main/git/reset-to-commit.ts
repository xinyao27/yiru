import type { GitResetToCommitResult } from '../../shared/git/write-op-results'
import {
  hasCommittedHead,
  isWorkingTreeDirty,
  resolveCommitOid
} from '../../shared/git/write-preconditions'
import { gitExecFileAsync } from './runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './runtime-options'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from './status'

/**
 * Reset the current branch to a commit. `mode` is always the caller's
 * explicit choice — `--hard` is never implied by a default. Only `--hard`
 * requires a clean working tree first: `--soft`/`--mixed` are routinely used
 * specifically to keep uncommitted changes across an undone commit, so
 * requiring a clean tree for those would break that normal usage.
 */
export async function resetToCommit(
  worktreePath: string,
  params: { commit: string; mode: 'soft' | 'mixed' | 'hard' },
  options: GitRuntimeOptions = {}
): Promise<GitResetToCommitResult> {
  const run = (args: string[]): Promise<{ stdout: string }> =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  const { commit, mode } = params

  if ((await detectConflictOperation(worktreePath)) !== 'unknown') {
    return {
      status: 'blocked',
      reason: 'operation_in_progress',
      message: 'A merge, rebase, cherry-pick, or revert is already in progress in this worktree.'
    }
  }
  if (!(await hasCommittedHead(run))) {
    return {
      status: 'blocked',
      reason: 'unborn_head',
      message: 'This branch has no commits yet, so there is nothing to reset.'
    }
  }
  if (mode === 'hard' && (await isWorkingTreeDirty(run))) {
    return {
      status: 'blocked',
      reason: 'dirty_working_tree',
      message: 'Commit or discard your changes before a hard reset — it discards uncommitted work.'
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
    await runWithGitReadCacheInvalidation(() => run(['reset', `--${mode}`, commitOid]))
    return { status: 'ok' }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
