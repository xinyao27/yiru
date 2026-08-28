import type { GitAddTagResult } from '@yiru/runtime-protocol/workbench/git/write-op-results'
import { isSafeRefArgument, resolveCommitOid } from '~main/git/status/write-preconditions'

import { gitExecFileAsync } from '../runner/runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../runner/runtime-options'
import { runWithGitReadCacheInvalidation } from '../status/status'

async function tagExists(
  run: (args: string[]) => Promise<{ stdout: string }>,
  name: string
): Promise<boolean> {
  try {
    await run(['show-ref', '--verify', '--quiet', `refs/tags/${name}`])
    return true
  } catch {
    return false
  }
}

/**
 * Create a lightweight or annotated tag at a commit. Refuses an existing tag
 * name unless `force` is explicitly set by the caller — `--force` is never
 * passed implicitly.
 */
export async function addTag(
  worktreePath: string,
  params: { name: string; commit: string; message?: string; force?: boolean },
  options: GitRuntimeOptions = {}
): Promise<GitAddTagResult> {
  const run = (args: string[]): Promise<{ stdout: string }> =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  const { name, commit, message, force = false } = params

  if (!isSafeRefArgument(name)) {
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

  if (!force && (await tagExists(run, name))) {
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
    await runWithGitReadCacheInvalidation(() => run(args))
    return { status: 'ok', tag: name }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
