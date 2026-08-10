import type { GitStatusResult, Worktree } from '~shared/types'
import type { WorkspaceCleanupBlocker } from '~shared/workspace/cleanup'

import { gitExecFileAsync } from '../git/runner'
import { getStatus } from '../git/status'
import {
  WORKSPACE_CLEANUP_GIT_READ_TIMEOUT_MS,
  withWorkspaceCleanupTimeout
} from './scan-primitives'

export type WorkspaceCleanupGitEvidence = {
  clean: boolean | null
  upstreamAhead: number | null
  upstreamBehind: number | null
  checkedAt: number | null
  blockers: WorkspaceCleanupBlocker[]
}

export function createEmptyWorkspaceCleanupGitEvidence(): WorkspaceCleanupGitEvidence {
  return {
    clean: null,
    upstreamAhead: null,
    upstreamBehind: null,
    checkedAt: null,
    blockers: []
  }
}

export async function readWorkspaceCleanupGitEvidence(
  worktree: Worktree
): Promise<WorkspaceCleanupGitEvidence> {
  const blockers: WorkspaceCleanupBlocker[] = []
  let status: GitStatusResult
  const checkedAt = Date.now()

  try {
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — a repo's git status is always read locally.
    status = await withWorkspaceCleanupTimeout(
      (signal) => getStatus(worktree.path, { signal }),
      WORKSPACE_CLEANUP_GIT_READ_TIMEOUT_MS,
      'Timed out reading git status.'
    )
  } catch {
    return {
      ...createEmptyWorkspaceCleanupGitEvidence(),
      blockers: ['git-status-error']
    }
  }

  if (status.upstreamStatus === undefined) {
    return {
      ...createEmptyWorkspaceCleanupGitEvidence(),
      blockers: ['git-status-error']
    }
  }

  const clean = status.entries.length === 0
  if (!clean) {
    blockers.push('dirty-files')
  }

  const upstreamAhead = status.upstreamStatus.hasUpstream ? status.upstreamStatus.ahead : null
  const upstreamBehind = status.upstreamStatus.hasUpstream ? status.upstreamStatus.behind : null
  if (upstreamAhead !== null && upstreamAhead > 0) {
    blockers.push('unpushed-commits')
  }
  if (clean && upstreamAhead === null) {
    const unpushedCommitCount = await readUnpushedCommitCount(worktree)
    if (unpushedCommitCount === null) {
      blockers.push('unknown-base')
    } else if (unpushedCommitCount > 0) {
      blockers.push('unpushed-commits')
    }
  }

  return {
    clean,
    upstreamAhead,
    upstreamBehind,
    checkedAt,
    blockers: uniqueWorkspaceCleanupGitBlockers(blockers)
  }
}

async function readUnpushedCommitCount(worktree: Worktree): Promise<number | null> {
  try {
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — a repo's git log is always read locally.
    const result = await withWorkspaceCleanupTimeout(
      (signal) =>
        gitExecFileAsync(['rev-list', '--count', 'HEAD', '--not', '--remotes'], {
          cwd: worktree.path,
          signal
        }),
      WORKSPACE_CLEANUP_GIT_READ_TIMEOUT_MS,
      'Timed out checking unpushed commits.'
    )
    const count = Number.parseInt(result.stdout.trim(), 10)
    return Number.isFinite(count) ? count : null
  } catch {
    return null
  }
}

function uniqueWorkspaceCleanupGitBlockers(
  blockers: WorkspaceCleanupBlocker[]
): WorkspaceCleanupBlocker[] {
  return [...new Set(blockers)]
}
