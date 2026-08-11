import type { GitHistoryOptions, GitHistoryResult } from '~shared/git/history'
import type {
  GitBranchCompareResult,
  GitCommitCompareResult,
  GitConflictOperation,
  GitDiffResult,
  GitStagingArea,
  GitStatusResult
} from '~shared/types'

import { callRuntimeOrpc } from '../orpc-client'
import { getRuntimeGitTarget, getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function getRuntimeGitStatus(
  context: RuntimeGitContext,
  options?: {
    includeIgnored?: boolean
    bypassEffectiveUpstreamNegativeCache?: boolean
    reuseLineStats?: boolean
    signal?: AbortSignal
  }
): Promise<GitStatusResult> {
  const input = {
    worktree: getRuntimeGitWorktree(context),
    ...(options?.includeIgnored ? { includeIgnored: true } : {}),
    ...(options?.bypassEffectiveUpstreamNegativeCache
      ? { bypassEffectiveUpstreamNegativeCache: true }
      : {}),
    ...(options?.reuseLineStats ? { reuseLineStats: true } : {})
  }
  return callRuntimeOrpc(getRuntimeGitTarget(context), (client) => client.git.status, input, {
    timeoutMs: 15_000,
    // Why: the safety refresh is bounded by its timeout and guarded against
    // stale results, while active refreshes must cancel host-side Git work.
    ...(options?.reuseLineStats ? {} : { signal: options?.signal })
  })
}

export async function getRuntimeGitSubmoduleStatus(
  context: RuntimeGitContext,
  submodulePath: string,
  area: GitStagingArea = 'unstaged'
): Promise<GitStatusResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.submoduleStatus,
    { worktree: getRuntimeGitWorktree(context), submodulePath, area },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitIgnoredPaths(
  context: RuntimeGitContext,
  paths: string[]
): Promise<string[]> {
  if (paths.length === 0) {
    return []
  }
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.checkIgnored,
    { worktree: getRuntimeGitWorktree(context), paths },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitHistory(
  context: RuntimeGitContext,
  options: GitHistoryOptions = {}
): Promise<GitHistoryResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.history,
    { worktree: getRuntimeGitWorktree(context), ...options },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitConflictOperation(
  context: RuntimeGitContext
): Promise<GitConflictOperation> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.conflictOperation,
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitDiff(
  context: RuntimeGitContext,
  args: { filePath: string; staged: boolean; compareAgainstHead?: boolean }
): Promise<GitDiffResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.diff,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitBranchCompare(
  context: RuntimeGitContext,
  baseRef: string
): Promise<GitBranchCompareResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.branchCompare,
    { worktree: getRuntimeGitWorktree(context), baseRef },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitCommitCompare(
  context: RuntimeGitContext,
  commitId: string
): Promise<GitCommitCompareResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.commitCompare,
    { worktree: getRuntimeGitWorktree(context), commitId },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitBranchDiff(
  context: RuntimeGitContext,
  args: {
    compare: { baseRef: string; baseOid: string; headOid: string; mergeBase: string }
    filePath: string
    oldPath?: string
  }
): Promise<GitDiffResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.branchDiff,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitCommitDiff(
  context: RuntimeGitContext,
  args: { commitOid: string; parentOid?: string | null; filePath: string; oldPath?: string }
): Promise<GitDiffResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.commitDiff,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitRemoteFileUrl(
  context: RuntimeGitContext,
  args: { relativePath: string; line: number }
): Promise<string | null> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.remoteFileUrl,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitRemoteCommitUrl(
  context: RuntimeGitContext,
  args: { sha: string }
): Promise<string | null> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.remoteCommitUrl,
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 15_000 }
  )
}

export async function findRuntimeGitHugeFoldersToIgnore(
  context: RuntimeGitContext
): Promise<string[]> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.findHugeFoldersToIgnore,
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 15_000 }
  )
}
