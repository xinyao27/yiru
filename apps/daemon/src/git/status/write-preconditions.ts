import type { GitConflictableWriteResult } from '@yiru/runtime-protocol/workbench/git/write-op-results'

import type { GitCommandRunner } from '../repo/effective-upstream'

export type { GitCommandRunner }

/**
 * Shared precondition checks for the destructive git write operations (tag,
 * create-branch, checkout-commit, cherry-pick, revert, drop, merge, rebase,
 * reset). Both the local main-process primitives (`main/git/*.ts`, wrapping
 * `gitExecFileAsync`) and the relay/SSH-remote op handlers (`relay/git/*.ts`,
 * wrapping the relay `GitExec`) share this logic so a precondition can't
 * silently diverge between the two dispatch stacks.
 */

export async function isWorkingTreeDirty(run: GitCommandRunner): Promise<boolean> {
  const { stdout } = await run(['status', '--porcelain'])
  return stdout.trim().length > 0
}

/** Null when HEAD is detached (no current branch). */
export async function readCurrentBranchName(run: GitCommandRunner): Promise<string | null> {
  try {
    const { stdout } = await run(['symbolic-ref', '--quiet', '--short', 'HEAD'])
    const name = stdout.trim()
    return name || null
  } catch {
    return null
  }
}

/** False for an unborn HEAD (a repo/branch with no commits yet). */
export async function hasCommittedHead(run: GitCommandRunner): Promise<boolean> {
  try {
    await run(['rev-parse', '--verify', '-q', 'HEAD'])
    return true
  } catch {
    return false
  }
}

/**
 * Resolve `commit` to a full oid, or null when it does not name a commit in
 * this repository. Defense-in-depth: callers also validate the shape at the
 * RPC schema (full 40/64-hex oid, never starting with `-`), but this confirms
 * the oid actually resolves before any mutating command touches it.
 */
export async function resolveCommitOid(
  run: GitCommandRunner,
  commit: string
): Promise<string | null> {
  try {
    const { stdout } = await run(['rev-parse', '--verify', '-q', `${commit}^{commit}`])
    const oid = stdout.trim()
    return oid || null
  } catch {
    return null
  }
}

/** Parent count of a resolved commit oid — 0 for a root commit, 2+ for a merge. */
export async function countCommitParents(
  run: GitCommandRunner,
  commitOid: string
): Promise<number> {
  const { stdout } = await run(['rev-list', '--parents', '-n', '1', commitOid])
  const tokens = stdout.trim().split(/\s+/).filter(Boolean)
  return Math.max(0, tokens.length - 1)
}

/** Whether a candidate ref name is safe to pass as a git argument (never a flag). */
export function isSafeRefArgument(value: string): boolean {
  return value.length > 0 && !value.startsWith('-')
}

export type MainlineCheckResult =
  | { ok: true }
  | { ok: false; reason: 'merge_commit_requires_mainline' | 'invalid_commit'; message: string }

/**
 * Cherry-pick and revert both require `-m <parent>` when the target is a
 * merge commit, and must reject a mainline option on a non-merge commit
 * (git itself would error, but this gives a precise reason up front).
 */
export function validateMainlineOption(
  parentCount: number,
  mainline?: number
): MainlineCheckResult {
  if (parentCount < 2) {
    if (mainline !== undefined) {
      return {
        ok: false,
        reason: 'invalid_commit',
        message: 'The mainline option only applies to merge commits.'
      }
    }
    return { ok: true }
  }
  if (mainline === undefined) {
    return {
      ok: false,
      reason: 'merge_commit_requires_mainline',
      message: 'This is a merge commit — choose a mainline parent number to continue.'
    }
  }
  if (!Number.isInteger(mainline) || mainline < 1 || mainline > parentCount) {
    return {
      ok: false,
      reason: 'invalid_commit',
      message: `Mainline must be an integer between 1 and ${parentCount} for this merge commit.`
    }
  }
  return { ok: true }
}

async function listConflictedPaths(run: GitCommandRunner): Promise<string[]> {
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

/**
 * Run a mutating git command that can stop mid-way with conflicts (merge,
 * cherry-pick, revert, drop-via-rebase, rebase-onto-commit). A non-zero exit
 * is ambiguous on its own — check whether it left the matching conflict state
 * behind before deciding "conflicts" vs. a genuine error, since a command can
 * also fail outright for unrelated reasons (bad ref, locked index, ...).
 */
export async function runConflictableGitOp(params: {
  run: GitCommandRunner
  args: string[]
  detectConflictOperation: () => Promise<string>
  expectedOperation: string
}): Promise<GitConflictableWriteResult> {
  try {
    await params.run(params.args)
    return { status: 'ok' }
  } catch (error) {
    const operation = await params.detectConflictOperation()
    if (operation === params.expectedOperation) {
      return { status: 'conflicts', paths: await listConflictedPaths(params.run) }
    }
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
