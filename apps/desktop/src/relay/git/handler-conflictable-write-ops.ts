import type {
  GitCherryPickResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitRevertResult
} from '~shared/git/write-op-results'
import {
  countCommitParents,
  isWorkingTreeDirty,
  readCurrentBranchName,
  resolveCommitOid,
  runConflictableGitOp,
  validateMainlineOption
} from '~shared/git/write-preconditions'

import type { GitExec } from './handler-ops'
import { detectConflictOperation } from './handler-status-ops'

type GitRun = (args: string[]) => Promise<{ stdout: string }>

function toRunner(git: GitExec, worktreePath: string): GitRun {
  return (args: string[]) => git(args, worktreePath)
}

async function requireCleanWorktreeWithNoOpInProgress(
  worktreePath: string,
  run: GitRun
): Promise<{
  status: 'blocked'
  reason: 'operation_in_progress' | 'dirty_working_tree'
  message: string
} | null> {
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
      message: 'Commit or discard your changes before continuing.'
    }
  }
  return null
}

/** Relay/SSH-remote counterpart of `main/git/cherry-pick.ts` — same rules. */
export async function cherryPickOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitCherryPickResult> {
  const worktreePath = params.worktreePath as string
  const commit = params.commit as string
  const mainline = params.mainline as number | undefined
  const run = toRunner(git, worktreePath)

  const blocked = await requireCleanWorktreeWithNoOpInProgress(worktreePath, run)
  if (blocked) {
    return blocked
  }
  const commitOid = await resolveCommitOid(run, commit)
  if (!commitOid) {
    return {
      status: 'blocked',
      reason: 'invalid_commit',
      message: `${commit} does not name a commit in this repository.`
    }
  }
  const mainlineCheck = validateMainlineOption(await countCommitParents(run, commitOid), mainline)
  if (!mainlineCheck.ok) {
    return { status: 'blocked', reason: mainlineCheck.reason, message: mainlineCheck.message }
  }
  return runConflictableGitOp({
    run,
    args: ['cherry-pick', '--no-edit', ...(mainline ? ['-m', String(mainline)] : []), commitOid],
    detectConflictOperation: () => detectConflictOperation(worktreePath),
    expectedOperation: 'cherry-pick'
  })
}

/** Relay/SSH-remote counterpart of `main/git/revert.ts` — same rules. */
export async function revertOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitRevertResult> {
  const worktreePath = params.worktreePath as string
  const commit = params.commit as string
  const mainline = params.mainline as number | undefined
  const run = toRunner(git, worktreePath)

  const blocked = await requireCleanWorktreeWithNoOpInProgress(worktreePath, run)
  if (blocked) {
    return blocked
  }
  const commitOid = await resolveCommitOid(run, commit)
  if (!commitOid) {
    return {
      status: 'blocked',
      reason: 'invalid_commit',
      message: `${commit} does not name a commit in this repository.`
    }
  }
  const mainlineCheck = validateMainlineOption(await countCommitParents(run, commitOid), mainline)
  if (!mainlineCheck.ok) {
    return { status: 'blocked', reason: mainlineCheck.reason, message: mainlineCheck.message }
  }
  return runConflictableGitOp({
    run,
    args: ['revert', '--no-edit', ...(mainline ? ['-m', String(mainline)] : []), commitOid],
    detectConflictOperation: () => detectConflictOperation(worktreePath),
    expectedOperation: 'revert'
  })
}

/** Relay/SSH-remote counterpart of `main/git/drop-commit.ts` — same rules. */
export async function dropCommitOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitDropCommitResult> {
  const worktreePath = params.worktreePath as string
  const commit = params.commit as string
  const run = toRunner(git, worktreePath)

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
  return runConflictableGitOp({
    run,
    args: ['rebase', '--onto', `${commitOid}^`, commitOid],
    detectConflictOperation: () => detectConflictOperation(worktreePath),
    expectedOperation: 'rebase'
  })
}

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

/** Relay/SSH-remote counterpart of `main/git/merge-commit.ts` — same rules. */
export async function mergeCommitOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitMergeCommitResult> {
  const worktreePath = params.worktreePath as string
  const commit = params.commit as string
  const noFf = params.noFf === true
  const squash = params.squash === true
  const message = params.message as string | undefined
  const run = toRunner(git, worktreePath)

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

  if (squash) {
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

  return runConflictableGitOp({
    run,
    args: [
      'merge',
      ...(noFf ? ['--no-ff'] : []),
      ...(message ? ['-m', message] : ['--no-edit']),
      commitOid
    ],
    detectConflictOperation: () => detectConflictOperation(worktreePath),
    expectedOperation: 'merge'
  })
}

/** Relay/SSH-remote counterpart of `main/git/rebase-onto-commit.ts` — same rules. */
export async function rebaseOntoCommitOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitRebaseOntoCommitResult> {
  const worktreePath = params.worktreePath as string
  const commit = params.commit as string
  const run = toRunner(git, worktreePath)

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
  return runConflictableGitOp({
    run,
    args: ['rebase', commitOid],
    detectConflictOperation: () => detectConflictOperation(worktreePath),
    expectedOperation: 'rebase'
  })
}
