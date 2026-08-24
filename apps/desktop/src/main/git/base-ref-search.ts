import type { BaseRefSearchResult } from '~shared/types'

import {
  getRefSearchTokens,
  mergeBaseRefSearchResultGroups,
  runSearchBaseRefsGit
} from './base-ref-search-query'
import {
  getDefaultBaseRefAsync,
  gitExecOptions,
  type LocalGitExecOptions
} from './default-base-ref'
import { gitExecFileAsync } from './runner'

export async function getDefaultRemote(
  path: string,
  options: LocalGitExecOptions = {}
): Promise<string> {
  const defaultRef = await getDefaultBaseRefAsync(path, options)
  // Why: getDefaultBaseRefAsync returns null when no default branch can be
  // detected (e.g. a brand-new repo with no commits on origin). Guard so we
  // don't crash on .includes(); fall through to the remote-list heuristics.
  const defaultBranch = defaultRef
    ? defaultRef.includes('/')
      ? defaultRef.split('/').slice(1).join('/')
      : defaultRef
    : null

  if (defaultBranch) {
    try {
      const { stdout } = await gitExecFileAsync(
        ['config', '--get', `branch.${defaultBranch}.remote`],
        gitExecOptions(path, options)
      )
      const value = stdout.trim()
      if (value) {
        return value
      }
    } catch {
      // Fall through: branch has no explicit remote configured.
    }
  }

  try {
    const { stdout } = await gitExecFileAsync(['remote'], gitExecOptions(path, options))
    const remotes = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (remotes.includes('origin')) {
      return 'origin'
    }
    if (remotes.length === 1) {
      return remotes[0]
    }
    if (remotes.length === 0) {
      throw new Error('Repo has no configured git remotes.')
    }
    throw new Error(
      `Repo has multiple remotes (${remotes.join(', ')}) and no default is configured. Set branch.<default>.remote.`
    )
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to resolve default remote for repo.')
  }
}

export async function searchBaseRefDetails(
  path: string,
  query: string,
  limit = 25
): Promise<BaseRefSearchResult[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    return []
  }
  const normalizedQuery = normalizeRefSearchQuery(query)

  try {
    // Why: argv (including the two-remote-glob rationale) lives in
    // buildSearchBaseRefsArgv so the SSH sibling cannot drift.
    const remotes = await listRemoteNames(path)
    const tokens = getRefSearchTokens(normalizedQuery)
    if (tokens.length > 1) {
      // Why: ambiguous slash queries need both display-format matches
      // (`upstream/feat`) and local branch-name matches (`plan/docs`).
      // Parse and merge buckets before the final limit so neither side starves.
      const results = await Promise.all([
        runSearchBaseRefsGit(path, normalizedQuery, limit, {
          remoteNames: remotes,
          patternGroup: 'segmented'
        }),
        runSearchBaseRefsGit(path, normalizedQuery, limit, {
          remoteNames: remotes,
          patternGroup: 'branchRoot'
        })
      ])
      return mergeBaseRefSearchResultGroups(
        results.map((entry) => parseAndFilterSearchRefDetails(entry.stdout, limit, remotes)),
        limit
      )
    }

    const result = await runSearchBaseRefsGit(path, normalizedQuery, limit, {
      remoteNames: remotes
    })
    return parseAndFilterSearchRefDetails(result.stdout, limit, remotes)
  } catch (err) {
    // Why: surface the failure for diagnostics; callers treat `[]` as "no
    // matches", but silently swallowing the error makes a missing result
    // set impossible to debug. Mirrors the SSH sibling in
    // src/main/project-groups/repos.ts.
    console.warn('[searchBaseRefs] for-each-ref failed', { path, err })
    return []
  }
}

async function listRemoteNames(path: string, options: LocalGitExecOptions = {}): Promise<string[]> {
  try {
    const { stdout } = await gitExecFileAsync(['remote'], gitExecOptions(path, options))
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export function parseAndFilterSearchRefDetails(
  stdout: string,
  limit: number,
  remotes: string[] = []
): BaseRefSearchResult[] {
  const seen = new Set<string>()
  const sortedRemotes = [...remotes].sort((a, b) => b.length - a.length)
  return (
    stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const nul = line.indexOf('\0')
        if (nul < 0) {
          // Why: defensive fallback for an unlikely %(refname) format change.
          // Drop the entry — emitting a full refname as a "short" ref would
          // hand callers a ref they can't use (and would bypass the HEAD
          // filter below, since we could no longer tell a `<remote>/HEAD`
          // pseudo-ref from a local branch named `foo/HEAD`).
          return null
        }
        return { full: line.slice(0, nul), short: line.slice(nul + 1) }
      })
      .filter((entry): entry is { full: string; short: string } => entry !== null)
      // Why: drop `refs/remotes/<remote>/HEAD` pseudo-refs. Uses `.+` (not
      // `[^/]+`) because git allows slashes in remote names, so nested
      // remotes like `refs/remotes/foo/bar/HEAD` also match. A local branch
      // named `foo/HEAD` (rare but valid per git check-ref-format) is
      // preserved because its `full` is `refs/heads/foo/HEAD`, which does
      // not match this pattern.
      .filter(({ full }) => !/^refs\/remotes\/.+\/HEAD$/.test(full))
      .filter(({ short }) => {
        if (seen.has(short)) {
          return false
        }
        seen.add(short)
        return true
      })
      .map(({ full, short }) => ({
        refName: short,
        localBranchName: resolveLocalBranchName(full, short, sortedRemotes)
      }))
      // Why: `Math.max(0, limit)` — treat pathological `limit <= 0` as
      // "zero results" rather than "at least 1". More honest than silently
      // returning a single ref when the caller explicitly asked for none.
      .slice(0, Math.max(0, limit))
  )
}

function resolveLocalBranchName(fullRef: string, shortRef: string, remotes: string[]): string {
  const remoteRefPrefix = 'refs/remotes/'
  if (!fullRef.startsWith(remoteRefPrefix)) {
    return shortRef
  }
  const remoteAndBranch = fullRef.slice(remoteRefPrefix.length)
  const remote = remotes.find((candidate) => remoteAndBranch.startsWith(`${candidate}/`))
  if (remote) {
    return remoteAndBranch.slice(remote.length + 1)
  }
  return remoteAndBranch.split('/').slice(1).join('/') || shortRef
}

export function normalizeRefSearchQuery(query: string): string {
  return query.trim().replace(/[*?[\]\\]/g, '')
}

async function hasGitRefAsync(
  path: string,
  ref: string,
  options: LocalGitExecOptions = {}
): Promise<boolean> {
  try {
    await gitExecFileAsync(['rev-parse', '--verify', ref], gitExecOptions(path, options))
    return true
  } catch {
    return false
  }
}

export type BranchConflictKind = 'local' | 'remote'

export async function getBranchConflictKind(
  path: string,
  branchName: string,
  allowedBaseRef?: string,
  options: LocalGitExecOptions = {}
): Promise<BranchConflictKind | null> {
  if (await hasGitRefAsync(path, `refs/heads/${branchName}`, options)) {
    return 'local'
  }

  try {
    const remoteNames = (await listRemoteNames(path, options)).sort((a, b) => b.length - a.length)
    const { stdout } = await gitExecFileAsync(
      ['for-each-ref', '--format=%(refname)', 'refs/remotes'],
      gitExecOptions(path, options)
    )
    const hasRemoteConflict = stdout.split('\n').some((ref) => {
      const trimmed = ref.trim()
      if (isAllowedRemoteBaseRef(trimmed, allowedBaseRef)) {
        return false
      }
      const shortRef = trimmed.replace(/^refs\/remotes\//, '')
      // Why: git allows slashes in remote names. Use the configured remote
      // list so foo/bar/feature resolves as branch "feature" for remote
      // "foo/bar", matching searchBaseRefDetails.
      return resolveLocalBranchName(trimmed, shortRef, remoteNames) === branchName
    })

    return hasRemoteConflict ? 'remote' : null
  } catch {
    return null
  }
}

function isAllowedRemoteBaseRef(refName: string, allowedBaseRef: string | undefined): boolean {
  if (!allowedBaseRef) {
    return false
  }
  const normalizedAllowedRef = allowedBaseRef.startsWith('refs/remotes/')
    ? allowedBaseRef
    : `refs/remotes/${allowedBaseRef}`
  return refName === normalizedAllowedRef
}
