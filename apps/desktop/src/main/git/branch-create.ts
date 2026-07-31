import type { GitCreateBranchResult } from '~shared/git/write-op-results'
import { isWorkingTreeDirty, resolveCommitOid } from '~shared/git/write-preconditions'

import { gitExecFileAsync } from './runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './runtime-options'
import { runWithGitReadCacheInvalidation } from './status'

async function branchExists(
  run: (args: string[]) => Promise<{ stdout: string }>,
  name: string
): Promise<boolean> {
  try {
    await run(['show-ref', '--verify', '--quiet', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

/**
 * Create a branch at a commit, optionally checking it out afterward. Refuses
 * an already-taken name or an invalid one (validated with
 * `git check-ref-format`) rather than letting git's own error surface.
 */
export async function createBranchFromCommit(
  worktreePath: string,
  params: { name: string; commit: string; checkout?: boolean },
  options: GitRuntimeOptions = {}
): Promise<GitCreateBranchResult> {
  const run = (args: string[]): Promise<{ stdout: string }> =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  const { name, commit, checkout = false } = params

  if (name.length === 0 || name.startsWith('-')) {
    return {
      status: 'blocked',
      reason: 'invalid_name',
      message: 'Branch name must not be empty or start with "-".'
    }
  }
  try {
    await run(['check-ref-format', `refs/heads/${name}`])
  } catch {
    return {
      status: 'blocked',
      reason: 'invalid_name',
      message: `"${name}" is not a valid branch name.`
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

  if (await branchExists(run, name)) {
    return { status: 'blocked', reason: 'name_exists', message: `Branch "${name}" already exists.` }
  }

  if (checkout && (await isWorkingTreeDirty(run))) {
    return {
      status: 'blocked',
      reason: 'dirty_working_tree',
      message: 'Commit or discard your changes before checking out the new branch.'
    }
  }

  try {
    await runWithGitReadCacheInvalidation(async () => {
      await run(['branch', name, commitOid])
      if (checkout) {
        await run(['checkout', name, '--'])
      }
    })
    return { status: 'ok', branch: name, checkedOut: checkout }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
