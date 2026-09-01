import { resolve } from 'node:path'

import { getRepoExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { ProjectSourceContext } from '@yiru/runtime-protocol/workbench/project-source-context'
import type {
  Repo,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult
} from '@yiru/runtime-protocol/workbench/types'

import type { Store } from '../persistence/store'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import {
  notePRRefreshValidationDenial,
  type PRRefreshValidationDenialReason
} from './pr-refresh-validation-backoff'

// Why: returns the full Repo object instead of just the path string so that
// callers have access to repo.id for stat tracking and other context.
export type RepoScopedArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: ProjectSourceContext | null
}

export type RegisteredRepoValidationResult =
  | { kind: 'ok'; repo: Repo }
  | { kind: 'denied'; reason: PRRefreshValidationDenialReason; message: string }

export function validateRegisteredRepo(
  args: string | RepoScopedArgs,
  store: Store,
  repos = store.getRepos()
): RegisteredRepoValidationResult {
  const repoPath = typeof args === 'string' ? args : args.repoPath
  const repoId = typeof args === 'string' ? undefined : args.repoId
  const resolvedRepoPath = resolve(repoPath)
  const repo = repos.find((r) => (repoId ? r.id === repoId : resolve(r.path) === resolvedRepoPath))
  if (!repo) {
    return {
      kind: 'denied',
      reason: 'unknown-repo',
      message: 'Access denied: unknown repository path'
    }
  }
  if (repoId && resolve(repo.path) !== resolvedRepoPath) {
    return {
      kind: 'denied',
      reason: 'repo-path-mismatch',
      message: 'Access denied: repository path does not match repo id'
    }
  }
  if (
    typeof args !== 'string' &&
    args.sourceContext?.provider === 'github' &&
    args.sourceContext.hostId !== getRepoExecutionHostId(repo)
  ) {
    return {
      kind: 'denied',
      reason: 'host-mismatch',
      message: 'Access denied: GitHub source host does not match repository host'
    }
  }
  return { kind: 'ok', repo }
}

export function assertRegisteredRepo(args: string | RepoScopedArgs, store: Store): Repo {
  const result = validateRegisteredRepo(args, store)
  if (result.kind === 'denied') {
    throw new Error(result.message)
  }
  return result.repo
}

export function localGitOptionArgs(store: Store, repo: Repo): [] | [{ wslDistro?: string }] {
  const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
  return Object.keys(localGitOptions).length > 0 ? [localGitOptions] : []
}

export function applyRepoToPRRefreshCandidate(
  store: Store,
  repo: Repo,
  candidate: GitHubPRRefreshCandidate
): GitHubPRRefreshCandidate {
  const localGitOptions = localGitOptionArgs(store, repo)[0]
  const appliedCandidate = { ...candidate }
  delete appliedCandidate.localGitOptions
  delete appliedCandidate.connectionId
  delete appliedCandidate.executionHostId
  delete appliedCandidate.connectionState
  return {
    ...appliedCandidate,
    repoPath: repo.path,
    repoId: repo.id,
    ...(localGitOptions ? { localGitOptions } : {}),
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — a registered repo is never remote.
    connectionId: null,
    executionHostId: repo.executionHostId ?? null,
    connectionState: 'unknown'
  }
}

export function validateAutomaticPRRefreshCandidate(
  candidate: GitHubPRRefreshCandidate,
  store: Store,
  repos = store.getRepos()
):
  | { kind: 'ok'; candidate: GitHubPRRefreshCandidate }
  | {
      kind: 'skipped'
      result: Extract<GitHubPRRefreshEnqueueResult, { kind: 'skipped' }>
    } {
  const result = validateRegisteredRepo(candidate, store, repos)
  if (result.kind === 'denied') {
    const skippedReason = notePRRefreshValidationDenial({
      repoId: candidate.repoId,
      repoPath: candidate.repoPath,
      reason: result.reason
    })
    return { kind: 'skipped', result: { kind: 'skipped', skippedReason } }
  }
  return { kind: 'ok', candidate: applyRepoToPRRefreshCandidate(store, result.repo, candidate) }
}
