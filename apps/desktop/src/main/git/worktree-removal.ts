import {
  branchHasNoUnmergedChangesOnAnyTarget,
  getBranchCleanupTargetRefs,
  refreshBranchCleanupTargetRefs
} from '~shared/git/branch-cleanup'
import type { RemoveWorktreeResult } from '~shared/types'
import { assertWorktreeUnlockedForRemoval } from '~shared/workspace/worktree-removal'
import { isSubmoduleWorktreeRemovalRefusal } from '~shared/workspace/worktree-submodule-removal'

import { getLocalGitCapabilityCache } from './capability-state'
import { gitExecFileAsync } from './runner'
import { runWithGitReadCacheInvalidation } from './status'
import {
  gitExecOptions,
  isBranchCheckedOutInWorktreeError,
  normalizeLocalBranchRef
} from './worktree-exec'
import { areWorktreePathsEqual, parseWorktreeList } from './worktree-graph'
import { bumpWorktreeScanGeneration, listWorktrees } from './worktree-listing'
import {
  WORKTREE_REMOVAL_PREFLIGHT_TIMEOUT_MS,
  type GitWorktreeExecOptions,
  type RemoveWorktreeOptions
} from './worktree-model'

type WorktreeRemovalPreflightOptions = GitWorktreeExecOptions & {
  ignoredUntrackedPaths?: readonly string[]
}

/**
 * Move a worktree's directory to a new path with `git worktree move`, which
 * relocates the working tree and rewrites git's gitdir pointers so the linkage
 * stays intact — a raw `fs.rename` would corrupt the `.git` file and the
 * `.git/worktrees/<name>/gitdir` back-pointer. Local worktrees only: the
 * first-work folder rename skips SSH/remote, so there is no relay parity handler
 * for this op. The caller owns migrating Yiru's path-derived worktree identity
 * after a successful move, and pre-checks that the destination is free.
 */
export async function moveWorktree(
  repoPath: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  try {
    await runWithGitReadCacheInvalidation(() =>
      gitExecFileAsync(['worktree', 'move', oldPath, newPath], { cwd: repoPath })
    )
  } finally {
    bumpWorktreeScanGeneration(repoPath)
  }
}

/**
 * Remove a worktree.
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false,
  // Why: forceBranchDelete is for cleaning up a worktree this code just created
  // (e.g. rollback of a failed creation) where the fresh branch has no user work
  // and must be removed outright. User-initiated deletes leave it false so unmerged
  // commits are preserved.
  options: RemoveWorktreeOptions = {}
): Promise<RemoveWorktreeResult> {
  try {
    return await runWithGitReadCacheInvalidation(() =>
      performRemoveWorktree(repoPath, worktreePath, force, options)
    )
  } finally {
    bumpWorktreeScanGeneration(repoPath)
  }
}

async function performRemoveWorktree(
  repoPath: string,
  worktreePath: string,
  force = false,
  options: RemoveWorktreeOptions = {}
): Promise<RemoveWorktreeResult> {
  const removedWorktree =
    options.knownRemovedWorktree ??
    (await listWorktrees(repoPath, options)).find((worktree) =>
      areWorktreePathsEqual(worktree.path, worktreePath)
    )
  const branchName = normalizeLocalBranchRef(removedWorktree?.branch ?? '')
  const branchHead = removedWorktree?.head ?? ''

  // Why: callers outside the IPC/runtime preflight must not bypass Git's lock
  // contract or depend on localized stderr to discover it after side effects.
  assertWorktreeUnlockedForRemoval(removedWorktree)

  const args = ['worktree', 'remove']
  if (force) {
    args.push('--force')
  }
  args.push(worktreePath)
  try {
    await gitExecFileAsync(args, gitExecOptions(repoPath, options))
  } catch (error) {
    if (force || !isSubmoduleWorktreeRemovalRefusal(error)) {
      throw error
    }
    // Why: Git refuses non-force removal of any worktree with an initialised
    // submodule even when everything is clean. Re-prove cleanliness (parent
    // status reports dirty submodule content as ` M <sub>`), then --force.
    await assertWorktreeCleanForRemoval(worktreePath, false, options)
    await gitExecFileAsync(
      ['worktree', 'remove', '--force', worktreePath],
      gitExecOptions(repoPath, options)
    )
  }

  if (!branchName) {
    return {}
  }
  if (options.deleteBranch === false) {
    return {}
  }

  try {
    // Why: `git worktree remove` only detaches the filesystem entry. Yiru also
    // drops the now-unused local branch here so delete-worktree does not leave
    // behind orphaned feature branches unless another worktree still points at it.
    // Use `-d` (not `-D`): Git refuses to delete a branch with commits not merged
    // into its upstream or HEAD, so unpublished work is preserved instead of
    // force-deleted. forceBranchDelete opts into `-D` for failed-creation rollback,
    // where the fresh branch has no user work to protect.
    const branchDeleteResult = await deleteLocalBranchAfterWorktreeRemoval(
      repoPath,
      branchName,
      options.forceBranchDelete === true,
      options
    )
    if (branchDeleteResult === 'checked-out') {
      return {}
    }
    return {}
  } catch (error) {
    if (!options.forceBranchDelete && branchHead) {
      try {
        if (
          await deleteAlreadyMergedBranchAfterSafeDeleteFailure(
            repoPath,
            branchName,
            branchHead,
            options
          )
        ) {
          return {}
        }
      } catch (alreadyMergedDeleteError) {
        // Why: the worktree is already gone; a raced branch cleanup should
        // degrade to the preserved-branch recovery path instead of failing delete.
        console.warn(
          `[git] Failed to delete already-merged local branch "${branchName}" after removing worktree`,
          alreadyMergedDeleteError
        )
      }
    }
    // Expected when the branch still has unmerged/unpublished commits: keep it.
    // Deleting a worktree must never silently discard commits.
    console.warn(
      `[git] Preserved local branch "${branchName}" after removing worktree (not fully merged)`,
      error
    )
    return { preservedBranch: { branchName, ...(branchHead ? { head: branchHead } : {}) } }
  }
}

async function deleteLocalBranchAfterWorktreeRemoval(
  repoPath: string,
  branchName: string,
  forceBranchDelete: boolean,
  options: GitWorktreeExecOptions = {}
): Promise<'deleted' | 'checked-out'> {
  const deleteFlag = forceBranchDelete ? '-D' : '-d'
  try {
    await gitExecFileAsync(
      ['branch', deleteFlag, '--', branchName],
      gitExecOptions(repoPath, options)
    )
    return 'deleted'
  } catch (error) {
    if (!isBranchCheckedOutInWorktreeError(error)) {
      throw error
    }
  }

  try {
    // Why: `branch -d` is the cheap live-checkout guard. Only pay for
    // `worktree prune` when a stale admin record may be the thing blocking it.
    await gitExecFileAsync(['worktree', 'prune'], gitExecOptions(repoPath, options))
  } catch (error) {
    console.warn(`[git] Failed to prune worktrees before deleting branch "${branchName}"`, error)
    return 'checked-out'
  }

  try {
    await gitExecFileAsync(
      ['branch', deleteFlag, '--', branchName],
      gitExecOptions(repoPath, options)
    )
    return 'deleted'
  } catch (error) {
    if (isBranchCheckedOutInWorktreeError(error)) {
      return 'checked-out'
    }
    throw error
  }
}

async function deleteAlreadyMergedBranchAfterSafeDeleteFailure(
  repoPath: string,
  branchName: string,
  branchHead: string,
  options: GitWorktreeExecOptions = {}
): Promise<boolean> {
  const runGit = (args: string[], execOptions?: { stdin?: string }) =>
    gitExecFileAsync(args, {
      ...gitExecOptions(repoPath, options),
      ...(execOptions?.stdin !== undefined ? { stdin: execOptions.stdin } : {})
    })
  const targetRefs = await getBranchCleanupTargetRefs(runGit, branchName)
  await refreshBranchCleanupTargetRefs(runGit, targetRefs)
  // Why: squash merges rewrite commit IDs, so `branch -d` can reject a branch
  // whose changes are already on the base ref. Delete only when Git can prove
  // the branch contributes no tree changes to that base.
  if (
    !(await branchHasNoUnmergedChangesOnAnyTarget(
      runGit,
      branchName,
      targetRefs,
      getLocalGitCapabilityCache({ cwd: repoPath, wslDistro: options.wslDistro })
    ))
  ) {
    return false
  }
  await forceDeleteLocalBranch(repoPath, branchName, branchHead, (args, cwd) =>
    gitExecFileAsync(args, gitExecOptions(cwd, options))
  )
  return true
}

export async function forceDeleteLocalBranch(
  repoPath: string,
  branchName: string,
  expectedHead: string,
  runGit: (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }> = (
    args,
    cwd
  ) => gitExecFileAsync(args, { cwd })
): Promise<void> {
  if (!branchName || branchName.includes('\0')) {
    throw new Error('Invalid branch name')
  }
  if (!expectedHead) {
    throw new Error(
      `Cannot force-delete local branch "${branchName}" without the commit Git preserved.`
    )
  }
  if (await isLocalBranchCheckedOut(repoPath, branchName, runGit)) {
    throw new Error(`Local branch "${branchName}" is checked out in another worktree.`)
  }
  // Why: stale toast actions must not delete a branch that moved after Git
  // preserved it. `update-ref` deletes only if the ref still has expectedHead.
  try {
    await runGit(['update-ref', '-d', `refs/heads/${branchName}`, expectedHead], repoPath)
  } catch {
    throw new Error(
      `Local branch "${branchName}" changed after the workspace was deleted. Review it before deleting it.`
    )
  }
  if (await isLocalBranchCheckedOut(repoPath, branchName, runGit)) {
    try {
      await runGit(['update-ref', `refs/heads/${branchName}`, expectedHead, ''], repoPath)
    } catch (restoreError) {
      console.warn(
        `[git] Failed to restore local branch "${branchName}" after concurrent checkout`,
        restoreError
      )
    }
    throw new Error(`Local branch "${branchName}" is checked out in another worktree.`)
  }
  try {
    await runGit(['config', '--remove-section', `branch.${branchName}`], repoPath)
  } catch {
    // Best-effort parity with `git branch -D`; stale config is harmless and
    // should not make the already-deleted ref look like a failed delete.
  }
}

async function isLocalBranchCheckedOut(
  repoPath: string,
  branchName: string,
  runGit: (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>
): Promise<boolean> {
  const { stdout } = await runGit(['worktree', 'list', '--porcelain'], repoPath)
  return parseWorktreeList(stdout).some(
    (worktree) => normalizeLocalBranchRef(worktree.branch) === branchName
  )
}

/**
 * Assert a worktree is clean enough for non-force removal.
 */
export async function assertWorktreeCleanForRemoval(
  worktreePath: string,
  force = false,
  options: WorktreeRemovalPreflightOptions = {}
): Promise<void> {
  if (force) {
    return
  }

  const { ignoredUntrackedPaths = [], ...gitOptions } = options
  const useNullTerminatedStatus = ignoredUntrackedPaths.length > 0
  const { stdout } = await gitExecFileAsync(
    ['status', '--porcelain', ...(useNullTerminatedStatus ? ['-z'] : []), '--untracked-files=all'],
    {
      ...gitExecOptions(worktreePath, gitOptions),
      timeout: gitOptions.timeout ?? WORKTREE_REMOVAL_PREFLIGHT_TIMEOUT_MS
    }
  )
  if (
    useNullTerminatedStatus
      ? hasOnlyIgnoredUntrackedStatus(stdout, ignoredUntrackedPaths)
      : !stdout.trim()
  ) {
    return
  }

  const error = new Error('Worktree has uncommitted or untracked changes.')
  ;(error as Error & { stdout?: string }).stdout = stdout
  throw error
}

function hasOnlyIgnoredUntrackedStatus(
  status: string,
  ignoredUntrackedPaths: readonly string[]
): boolean {
  const ignored = new Set(
    ignoredUntrackedPaths
      .map((entry) =>
        entry
          .trim()
          .replace(/^[\\/]+/, '')
          .replace(/\\/g, '/')
      )
      .filter((entry) => entry && !entry.split('/').includes('..'))
  )
  return status
    .split('\0')
    .filter(Boolean)
    .every((entry) => entry.startsWith('?? ') && ignored.has(entry.slice(3).replace(/\\/g, '/')))
}
