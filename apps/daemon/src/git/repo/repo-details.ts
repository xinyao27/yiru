import { basename } from 'node:path'

import { parseGitRevListAheadBehindCounts } from '@yiru/runtime-protocol/workbench/git/rev-list-output'

import { gitExecFileAsync, gitExecFileSync } from '../runner/runner'
import { gitExecOptions, type LocalGitExecOptions } from './default-base-ref'

export function getRepoName(path: string): string {
  const name = basename(path)
  // Strip .git suffix from bare repos
  return name.endsWith('.git') ? name.slice(0, -4) : name
}

/**
 * Get the remote origin URL, or null if not set.
 */
export function getRemoteUrl(path: string): string | null {
  try {
    return getRemoteUrlByName(path, 'origin')
  } catch {
    return null
  }
}

function getRemoteUrlByName(path: string, remote: string): string {
  return gitExecFileSync(['remote', 'get-url', remote], {
    cwd: path
  }).trim()
}

export function getRemoteDrift(
  repoPath: string,
  localRef: string,
  remoteRef: string,
  options: LocalGitExecOptions = {}
): { ahead: number; behind: number } | null {
  try {
    const stdout = gitExecFileSync(
      ['rev-list', '--left-right', '--count', `${localRef}...${remoteRef}`],
      gitExecOptions(repoPath, options)
    )
    const counts = parseGitRevListAheadBehindCounts(stdout)
    if (counts.status !== 'ok') {
      return null
    }
    return { ahead: counts.ahead, behind: counts.behind }
  } catch {
    return null
  }
}

/**
 * Up to `limit` commit subjects present on remoteRef but not localRef, in
 * recency order. Returns [] on git failure.
 *
 * Why: powers the preamble drift section (§3.2) so a worker dispatched
 * against an acknowledged-stale base can see at a glance whether the
 * drift touches their task area.
 */
export function getRecentDriftSubjects(
  repoPath: string,
  localRef: string,
  remoteRef: string,
  limit: number,
  options: LocalGitExecOptions = {}
): string[] {
  try {
    const stdout = gitExecFileSync(
      ['log', '--format=%s', '-n', String(limit), `${localRef}..${remoteRef}`],
      gitExecOptions(repoPath, options)
    )
    return stdout.split('\n').filter((s) => s.trim().length > 0)
  } catch {
    return []
  }
}

/**
 * Parse `git remote` stdout into a count of configured remotes.
 *
 * Why: shared between the local path and the SSH relay path so the
 * count semantics cannot drift.
 */
export function parseRemoteCount(stdout: string): number {
  return stdout.split('\n').filter((line) => line.trim().length > 0).length
}

/**
 * Count the repo's configured remotes by shelling out `git remote`.
 * Returns 0 on error — callers use 0 as "unknown / do not render the
 * multi-remote hint", preserving today's no-hint behavior on failure.
 */
export async function getRemoteCount(path: string): Promise<number> {
  try {
    const { stdout } = await gitExecFileAsync(['remote'], { cwd: path })
    return parseRemoteCount(stdout)
  } catch (err) {
    // Why: surface the failure for diagnostics; callers treat 0 as "unknown /
    // do not render the multi-remote hint", but silently swallowing the error
    // makes a missing hint impossible to debug.
    console.warn('[getRemoteCount] git remote failed', { path, err })
    return 0
  }
}

/** Callback shape for a git exec function that yields stdout. */
