import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCreateBranchResult,
  GitResetToCommitResult
} from '../../shared/git/write-op-results'
import {
  hasCommittedHead,
  isWorkingTreeDirty,
  resolveCommitOid
} from '../../shared/git/write-preconditions'
import type { GitExec } from './handler-ops'
import { detectConflictOperation } from './handler-status-ops'

function toRunner(
  git: GitExec,
  worktreePath: string
): (args: string[]) => Promise<{ stdout: string }> {
  return (args: string[]) => git(args, worktreePath)
}

async function refExists(
  run: (args: string[]) => Promise<{ stdout: string }>,
  ref: string
): Promise<boolean> {
  try {
    await run(['show-ref', '--verify', '--quiet', ref])
    return true
  } catch {
    return false
  }
}

/** Relay/SSH-remote counterpart of `main/git/tag.ts` `addTag` — same rules. */
export async function addTagOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitAddTagResult> {
  const worktreePath = params.worktreePath as string
  const name = params.name as string
  const commit = params.commit as string
  const message = params.message as string | undefined
  const force = params.force === true
  const run = toRunner(git, worktreePath)

  if (name.length === 0 || name.startsWith('-')) {
    return {
      status: 'blocked',
      reason: 'invalid_name',
      message: 'Tag name must not be empty or start with "-".'
    }
  }
  try {
    await run(['check-ref-format', '--allow-onelevel', `refs/tags/${name}`])
  } catch {
    return {
      status: 'blocked',
      reason: 'invalid_name',
      message: `"${name}" is not a valid tag name.`
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
  if (!force && (await refExists(run, `refs/tags/${name}`))) {
    return { status: 'blocked', reason: 'name_exists', message: `Tag "${name}" already exists.` }
  }
  const args = ['tag']
  if (force) {
    args.push('--force')
  }
  if (message) {
    args.push('-a', name, commitOid, '-m', message)
  } else {
    args.push(name, commitOid)
  }
  try {
    await run(args)
    return { status: 'ok', tag: name }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** Relay/SSH-remote counterpart of `main/git/branch-create.ts` — same rules. */
export async function createBranchOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitCreateBranchResult> {
  const worktreePath = params.worktreePath as string
  const name = params.name as string
  const commit = params.commit as string
  const checkout = params.checkout === true
  const run = toRunner(git, worktreePath)

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
  if (await refExists(run, `refs/heads/${name}`)) {
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
    await run(['branch', name, commitOid])
    if (checkout) {
      await run(['checkout', name, '--'])
    }
    return { status: 'ok', branch: name, checkedOut: checkout }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** Relay/SSH-remote counterpart of `main/git/checkout-commit.ts` — same rules. */
export async function checkoutCommitOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitCheckoutCommitResult> {
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
    await run(['checkout', commitOid, '--'])
    return { status: 'ok', commit: commitOid }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** Relay/SSH-remote counterpart of `main/git/reset-to-commit.ts` — same rules. */
export async function resetToCommitOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitResetToCommitResult> {
  const worktreePath = params.worktreePath as string
  const commit = params.commit as string
  const mode = params.mode as 'soft' | 'mixed' | 'hard'
  const run = toRunner(git, worktreePath)

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
    await run(['reset', `--${mode}`, commitOid])
    return { status: 'ok' }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
