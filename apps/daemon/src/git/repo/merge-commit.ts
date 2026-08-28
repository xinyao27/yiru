import type { GitMergeCommitResult } from '@yiru/runtime-protocol/workbench/git/write-op-results'
import {
  isWorkingTreeDirty,
  readCurrentBranchName,
  resolveCommitOid,
  runConflictableGitOp
} from '~main/git/status/write-preconditions'

import { gitExecFileAsync } from '../runner/runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../runner/runtime-options'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from '../status/status'

type GitRun = (args: string[]) => Promise<{ stdout: string }>

async function listUnmergedPaths(run: GitRun): Promise<string[]> {
  try {
    const { stdout } = await run(['diff', '--name-only', '--diff-filter=U'])
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

// Why: `git merge --squash` never records MERGE_HEAD (per git-merge(1)), so a
// squash conflict is invisible to the normal MERGE_HEAD-based conflict
// detection used for a real merge. Check the index for unmerged paths
// directly instead of routing through runConflictableGitOp/detectConflictOperation.
async function runSquashMerge(
  run: GitRun,
  commitOid: string,
  message: string | undefined
): Promise<GitMergeCommitResult> {
  try {
    await run(['merge', '--squash', commitOid])
  } catch (error) {
    const paths = await listUnmergedPaths(run)
    if (paths.length > 0) {
      return { status: 'conflicts', paths }
    }
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  try {
    await run(message ? ['commit', '-m', message] : ['commit', '--no-edit'])
    return { status: 'ok' }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Merge a commit into the current branch. `squash` stages the merge without
 * committing (git never records MERGE_HEAD for it), then commits separately;
 * `noFf` is ignored when `squash` is set since git itself rejects combining
 * them. A real (non-squash) merge always passes `-m`/`--no-edit` so no
 * editor is ever launched.
 */
export async function mergeCommit(
  worktreePath: string,
  params: { commit: string; noFf?: boolean; squash?: boolean; message?: string },
  options: GitRuntimeOptions = {}
): Promise<GitMergeCommitResult> {
  const run: GitRun = (args) => gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  const { commit, noFf = false, squash = false, message } = params

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
      message: 'Check out a branch before merging — HEAD is currently detached.'
    }
  }
  if (await isWorkingTreeDirty(run)) {
    return {
      status: 'blocked',
      reason: 'dirty_working_tree',
      message: 'Commit or discard your changes before merging.'
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

  return runWithGitReadCacheInvalidation(async () => {
    if (squash) {
      return runSquashMerge(run, commitOid, message)
    }
    const args = [
      'merge',
      ...(noFf ? ['--no-ff'] : []),
      ...(message ? ['-m', message] : ['--no-edit']),
      commitOid
    ]
    return runConflictableGitOp({
      run,
      args,
      detectConflictOperation: () => detectConflictOperation(worktreePath),
      expectedOperation: 'merge'
    })
  })
}
