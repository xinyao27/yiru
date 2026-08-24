import type { LocalBaseRefRefreshResult, LocalBaseRefUpdateSuggestion } from '~shared/types'
import { resolveWorktreeAddBaseRef } from '~shared/workspace/worktree-base-ref'

import { gitExecFileAsync } from './runner'
import { runWithGitReadCacheInvalidation } from './status'
import { hasWorktreeBaseCommitRef } from './worktree-base-ref-probe'
import {
  getLocalBaseRefUpdateSuggestionForWorktreeCreate,
  persistWorktreeCreationBase,
  refreshLocalBaseRefForWorktreeCreate,
  unsetWorktreeCreationBase
} from './worktree-base-refresh'
import { gitExecOptions } from './worktree-exec'
import { bumpWorktreeScanGeneration } from './worktree-listing'
import type { AddWorktreeOptions, AddWorktreeResult } from './worktree-model'
import { WORKTREE_ADD_TIMEOUT_MS } from './worktree-model'
import { removeWorktree } from './worktree-removal'

type SparseWorktreeCreateError = Error & {
  cleanupFailed?: boolean
}

/**
 * Create a new worktree.
 * @param repoPath - Path to the main repo (or bare repo)
 * @param worktreePath - Absolute path where the worktree will be created
 * @param branch - Branch name for the new worktree
 * @param baseBranch - Optional base branch to create from (defaults to HEAD)
 * @remarks Side effect: passes `--no-track`, writes `branch.<branch>.base`
 * for new-branch worktrees with a base ref, and may write
 * `push.autoSetupRemote=true` to the repo's shared config. Config writes are
 * best-effort and warn-only. See body comments below for the full rationale.
 */
export async function addWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  baseBranch?: string,
  refreshLocalBaseRef = false,
  noCheckout = false,
  options: AddWorktreeOptions = {}
): Promise<AddWorktreeResult> {
  try {
    return await runWithGitReadCacheInvalidation(() =>
      performAddWorktree(
        repoPath,
        worktreePath,
        branch,
        baseBranch,
        refreshLocalBaseRef,
        noCheckout,
        options
      )
    )
  } finally {
    bumpWorktreeScanGeneration(repoPath)
  }
}

async function performAddWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  baseBranch?: string,
  refreshLocalBaseRef = false,
  noCheckout = false,
  options: AddWorktreeOptions = {}
): Promise<AddWorktreeResult> {
  let localBaseRefRefresh: LocalBaseRefRefreshResult | undefined
  let localBaseRefUpdateSuggestion: LocalBaseRefUpdateSuggestion | undefined
  const args = ['worktree', 'add']
  let effectiveBase: string | undefined
  if (noCheckout) {
    args.push('--no-checkout')
  }
  if (options.checkoutExistingBranch) {
    // Why: -b would create a new branch instead of checking out the selected one.
    args.push(worktreePath, branch)
  } else {
    // Why: --no-track keeps the new branch from inheriting the base ref's
    // upstream, so `git status` doesn't report "behind by N" against the base
    // pre-publish and tools/agents don't misread an unpublished branch as
    // out-of-sync. First push sets the upstream — see push.autoSetupRemote
    // below for the terminal ergonomics.
    args.push('--no-track', '-b', branch, worktreePath)
    if (baseBranch) {
      effectiveBase = await resolveWorktreeAddBaseRef(baseBranch, (qualifiedRef) =>
        hasWorktreeBaseCommitRef(repoPath, qualifiedRef, options)
      )
      // Why: resolving the creation base first distinguishes real
      // remote-tracking refs from slash-containing local branch names.
      // The mutation stays behind the explicit setting so the default
      // remains conservative.
      if (refreshLocalBaseRef) {
        localBaseRefRefresh = await refreshLocalBaseRefForWorktreeCreate(
          repoPath,
          baseBranch,
          effectiveBase,
          options.remoteTrackingBase,
          options
        )
      } else if (options.suggestLocalBaseRefUpdate) {
        localBaseRefUpdateSuggestion = await getLocalBaseRefUpdateSuggestionForWorktreeCreate(
          repoPath,
          baseBranch,
          effectiveBase,
          options.remoteTrackingBase,
          options
        )
      }
      args.push(effectiveBase)
    }
  }
  await gitExecFileAsync(args, {
    ...gitExecOptions(repoPath, options),
    // Why: bound the checkout so a OneDrive cloud-placeholder stall (STA-1292)
    // fails fast rather than hanging worktree creation indefinitely.
    timeout: WORKTREE_ADD_TIMEOUT_MS
  })

  if (options.checkoutExistingBranch) {
    return localBaseRefRefresh ? { localBaseRefRefresh } : {}
  }

  if (effectiveBase) {
    await persistWorktreeCreationBase(worktreePath, branch, effectiveBase, options)
  }

  // SSH parity: the relay's `addWorktreeOp` git handler mirrors this exact
  // probe-and-write state machine. If you change the logic here, update
  // the relay handler in lockstep so local and SSH paths stay aligned.
  //
  // Why: with --no-track there is no upstream until first push. Setting
  // push.autoSetupRemote=true makes a plain `git push` from the terminal
  // create origin/<branch> and set it as upstream automatically — matching
  // user expectations from modern git without requiring `-u`. Note that
  // `--local` on a linked worktree writes to the shared common-dir config,
  // so this affects the whole repo, not just this worktree. That is
  // intentional and acceptable: the value is benign and idempotent, and
  // every Yiru-created worktree wants the same default. True per-worktree
  // scope would require enabling extensions.worktreeConfig=true repo-wide,
  // which is a larger change we deliberately avoid.
  //
  // Notes on the design:
  // - push.autoSetupRemote is honored by git >= 2.37; older clients ignore
  //   the value, so `git push` falls back to the pre-2.37 "no upstream"
  //   error and the user runs `git push -u` once.
  // - Failures here are warn-only: config writes are best-effort and a
  //   missing write degrades to the same fallback as old git.
  // - The write is skipped when any value is already set (local, global,
  //   or system) so a deliberate user `false` is preserved.
  // - Not rolled back on creation failure: addSparseWorktree's catch path
  //   removes the worktree but does not unset this config. That is consistent
  //   with the "benign and idempotent" rationale above — every Yiru-created
  //   worktree wants this default, and a future creation will silently re-set
  //   it via the existing-value check anyway.
  try {
    // Why: `--get` (not `--local --get`) so a value set at any scope
    // (local/global/system) counts as "user already chose" and we don't
    // overwrite it.
    let alreadySet = false
    try {
      await gitExecFileAsync(['config', '--get', 'push.autoSetupRemote'], {
        ...gitExecOptions(worktreePath, options)
      })
      alreadySet = true
    } catch (readError) {
      // Why: `git config --get` exits 1 only when the key is unset at every
      // scope. Any other exit code means a real read failure (corrupt config,
      // locked file, parse error) — surface that via the outer catch instead
      // of silently overwriting whatever value the user actually has.
      const code = (readError as { code?: unknown })?.code
      if (code !== 1) {
        throw readError
      }
    }
    if (!alreadySet) {
      await gitExecFileAsync(['config', '--local', 'push.autoSetupRemote', 'true'], {
        ...gitExecOptions(worktreePath, options)
      })
    }
  } catch (error) {
    console.warn(`addWorktree: failed to set push.autoSetupRemote for ${worktreePath}`, error)
  }
  return {
    ...(localBaseRefRefresh ? { localBaseRefRefresh } : {}),
    ...(localBaseRefUpdateSuggestion ? { localBaseRefUpdateSuggestion } : {})
  }
}

export async function addSparseWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  directories: string[],
  baseBranch?: string,
  refreshLocalBaseRef = false,
  options: AddWorktreeOptions = {}
): Promise<AddWorktreeResult> {
  let created = false
  let addResult: AddWorktreeResult = {}
  try {
    addResult = await addWorktree(
      repoPath,
      worktreePath,
      branch,
      baseBranch,
      refreshLocalBaseRef,
      true,
      options
    )
    created = true
    await gitExecFileAsync(
      ['sparse-checkout', 'init', '--cone'],
      gitExecOptions(worktreePath, options)
    )
    await gitExecFileAsync(
      ['sparse-checkout', 'set', '--', ...directories],
      gitExecOptions(worktreePath, options)
    )
    await gitExecFileAsync(['checkout', branch], gitExecOptions(worktreePath, options))
    return addResult
  } catch (error) {
    const wrapped: SparseWorktreeCreateError =
      error instanceof Error ? (error as SparseWorktreeCreateError) : new Error(String(error))
    if (created) {
      if (!options.checkoutExistingBranch) {
        await unsetWorktreeCreationBase(worktreePath, branch, options)
      }
      try {
        await removeWorktree(repoPath, worktreePath, true, {
          deleteBranch: !options.checkoutExistingBranch,
          // Why: rolling back a failed creation — the just-created branch has no
          // user commits, so force-delete it rather than preserving an orphan.
          forceBranchDelete: !options.checkoutExistingBranch,
          ...(options.wslDistro ? { wslDistro: options.wslDistro } : {})
        })
      } catch {
        wrapped.cleanupFailed = true
        // Why: the user needs to know that manual cleanup may be required —
        // otherwise a half-created worktree silently lingers on disk.
        wrapped.message = `${wrapped.message} (cleanup also failed — the partially created worktree at "${worktreePath}" may need manual removal)`
      }
    }
    throw wrapped
  }
}
