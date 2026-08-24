import { isForEachRefExcludeUnsupportedError } from '~shared/git/ref-command-capabilities'
import type { BaseRefSearchResult } from '~shared/types'

import { getLocalGitCapabilityCache } from './capability-state'
import { gitExecFileAsync } from './runner'

const REF_SEARCH_CANDIDATE_MULTIPLIER = 4
const REF_SEARCH_LEGACY_HEADROOM = 100

export type RefSearchPatternGroup = 'all' | 'segmented' | 'branchRoot'

export function getRefSearchTokens(normalizedQuery: string): string[] {
  return normalizedQuery.split('/').filter((t) => t.length > 0)
}

function getRefSearchCandidateCount(limit: number, excludesRemoteHead: boolean): number {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('invalid_limit')
  }
  const baseCount = limit * REF_SEARCH_CANDIDATE_MULTIPLIER
  return excludesRemoteHead ? baseCount : baseCount + REF_SEARCH_LEGACY_HEADROOM
}

export function buildSearchBaseRefsArgv(
  normalizedQuery: string,
  limit: number,
  options: {
    excludeRemoteHead?: boolean
    remoteNames?: readonly string[]
    patternGroup?: RefSearchPatternGroup
  } = {}
): string[] {
  const excludeRemoteHead = options.excludeRemoteHead ?? true
  const candidateCount = getRefSearchCandidateCount(limit, excludeRemoteHead)
  const base = [
    'for-each-ref',
    '--format=%(refname)%00%(refname:short)',
    '--sort=-committerdate',
    ...(excludeRemoteHead
      ? [
          // Why: exclude remote HEAD pseudo-refs before --count so the bounded
          // candidate window is spent on refs the picker can actually display.
          '--exclude=refs/remotes/**/HEAD'
        ]
      : []),
    // Why: empty Branch-tab searches use broad globs; cap git output before
    // execFile/SSH buffers capture every ref in very large repositories.
    `--count=${candidateCount}`
  ]
  // Why: split on `/` so display-format queries (`upstream/main`) route
  // each token to one git ref segment. Filter empty tokens so trailing
  // (`upstream/`), leading (`/main`), or doubled (`upstream//main`)
  // slashes don't produce empty `**` segments that degrade to useless
  // patterns. A single remaining token means the user hasn't committed
  // to a remote-plus-branch query yet — route through the widened
  // single-segment globs below instead of pinning to one segment.
  const tokens = getRefSearchTokens(normalizedQuery)
  if (tokens.length <= 1) {
    const q = tokens[0] ?? ''
    // Why `**`, not `*`: git for-each-ref globs are fnmatch-style where a
    // single `*` does NOT cross `/`. Slash-named branches (`user/feature`)
    // are the norm, so match both leaf and ancestor branch-name segments.
    // The remote ancestor glob also preserves remote-name queries like
    // `upstream` while `**/` keeps flat names like `main` working.
    return [
      ...base,
      `refs/heads/**/*${q}*`,
      `refs/heads/**/*${q}*/**`,
      `refs/remotes/**/*${q}*`,
      `refs/remotes/**/*${q}*/**`
    ]
  }
  // Why: multi-token queries like `upstream/main` map one `*token*` per
  // ref segment, so each token is matched within a single git ref
  // segment (fnmatch `*` cannot cross `/`). The picker displays results
  // as `<remote>/<branch>`, so users naturally retype that format; this
  // branch is what makes re-typing a visible result actually find it.
  const segmented = tokens.map((token) => `*${token}*`).join('/')
  const substringQuery = tokens.join('/')
  const remoteBranchRootPatterns =
    options.remoteNames && options.remoteNames.length > 0
      ? options.remoteNames.flatMap((remote) => [
          `refs/remotes/${remote}/${substringQuery}*`,
          `refs/remotes/${remote}/${substringQuery}*/**`
        ])
      : [`refs/remotes/*/${substringQuery}*`, `refs/remotes/*/${substringQuery}*/**`]
  const segmentedPatterns = [`refs/remotes/${segmented}`, `refs/heads/${segmented}`]
  const branchRootPatterns = [
    // Why: branch names often contain slashes (`plan/docs`). Segment-wise
    // display-format globs only align with `<remote>/<branch>`; these root
    // patterns also match the local branch name beneath any configured remote.
    `refs/heads/${substringQuery}*`,
    `refs/heads/${substringQuery}*/**`,
    ...remoteBranchRootPatterns
  ]
  const patterns =
    options.patternGroup === 'segmented'
      ? segmentedPatterns
      : options.patternGroup === 'branchRoot'
        ? branchRootPatterns
        : [...segmentedPatterns, ...branchRootPatterns]
  return [...base, ...patterns]
}

export async function runSearchBaseRefsGit(
  path: string,
  normalizedQuery: string,
  limit: number,
  options: { remoteNames: readonly string[]; patternGroup?: RefSearchPatternGroup }
): Promise<{ stdout: string }> {
  return getLocalGitCapabilityCache({ cwd: path }).runWithFallback(
    'for-each-ref-exclude',
    () =>
      gitExecFileAsync(
        buildSearchBaseRefsArgv(normalizedQuery, limit, {
          remoteNames: options.remoteNames,
          patternGroup: options.patternGroup
        }),
        { cwd: path }
      ),
    () =>
      gitExecFileAsync(
        buildSearchBaseRefsArgv(normalizedQuery, limit, {
          excludeRemoteHead: false,
          remoteNames: options.remoteNames,
          patternGroup: options.patternGroup
        }),
        { cwd: path }
      ),
    isForEachRefExcludeUnsupportedError
  )
}

export function mergeBaseRefSearchResultGroups(
  groups: readonly BaseRefSearchResult[][],
  limit: number
): BaseRefSearchResult[] {
  const seen = new Set<string>()
  const merged: BaseRefSearchResult[] = []
  const maxLength = Math.max(0, ...groups.map((group) => group.length))
  for (let index = 0; index < maxLength && merged.length < limit; index += 1) {
    for (const group of groups) {
      const entry = group[index]
      if (!entry || seen.has(entry.refName)) {
        continue
      }
      seen.add(entry.refName)
      merged.push(entry)
      if (merged.length >= limit) {
        break
      }
    }
  }
  return merged
}

export { isForEachRefExcludeUnsupportedError } from '~shared/git/ref-command-capabilities'

/**
 * Resolve the default push remote for a repo.
 * Order: remote configured on the current default branch → origin → the single
 * remote when the repo has exactly one → error.
 */
