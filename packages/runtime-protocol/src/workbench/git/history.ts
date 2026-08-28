import {
  GIT_HISTORY_DEFAULT_LIMIT,
  GIT_HISTORY_MAX_LIMIT,
  type GitHistoryExecutor,
  type GitHistoryItemRef,
  type GitHistoryOptions,
  type GitHistoryResult
} from '@yiru/runtime-protocol/model/review'

import { GitCapabilityCache } from './capability-cache'
import {
  GIT_HISTORY_COMMIT_FORMAT,
  GIT_HISTORY_COMMIT_FORMAT_FALLBACK,
  gitHistoryRefFromFullName,
  parseGitHistoryLog,
  shortGitHash
} from './history-log-parser'
import {
  GitLogDecorateFormatModifierUnsupportedSignal,
  isLogDecorateFormatModifierUnsupportedError
} from './log-decorate-capability'

export type {
  GitHistoryExecutor,
  GitHistoryGraphColorId,
  GitHistoryItem,
  GitHistoryItemRef,
  GitHistoryItemStatistics,
  GitHistoryOptions,
  GitHistoryRefCategory,
  GitHistoryRefScope,
  GitHistoryResult
} from '@yiru/runtime-protocol/model/review'
export {
  GIT_HISTORY_BASE_REF_COLOR,
  GIT_HISTORY_DEFAULT_LIMIT,
  GIT_HISTORY_LANE_COLORS,
  GIT_HISTORY_MAX_LIMIT,
  GIT_HISTORY_REF_COLOR,
  GIT_HISTORY_REMOTE_REF_COLOR
} from '@yiru/runtime-protocol/model/review'
export { compareGitHistoryItemRefsByCategory, parseGitHistoryLog } from './history-log-parser'

function clampHistoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return GIT_HISTORY_DEFAULT_LIMIT
  }
  return Math.min(
    GIT_HISTORY_MAX_LIMIT,
    Math.max(1, Math.trunc(limit ?? GIT_HISTORY_DEFAULT_LIMIT))
  )
}

function clampHistorySkip(skip: number | undefined): number {
  if (!Number.isFinite(skip)) {
    return 0
  }
  return Math.max(0, Math.trunc(skip ?? 0))
}

async function runGitLog(
  git: GitHistoryExecutor,
  cwd: string,
  logArgs: string[],
  capabilities: GitCapabilityCache
): Promise<string> {
  // Why: the preferred format uses a control-character decoration separator
  // via `%(decorate:...)` (Git 2.34+, see history-log-parser.ts). Older Git at
  // the 2.25 baseline does not error on the unrecognized placeholder — it
  // echoes it back literally with exit code 0 — so unsupported-ness can only
  // be detected from the *content* of a successful result, not from a thrown
  // error. The preferred callback below throws a sentinel when it spots the
  // literal placeholder text, which `GitCapabilityCache` treats the same as
  // any other "unsupported" failure and memoizes per host, so only the first
  // call after a retry window pays for both the preferred and fallback query.
  return capabilities.runWithFallback(
    'log-decorate-format-modifier',
    async () => {
      const stdout = (await git(['log', `--format=${GIT_HISTORY_COMMIT_FORMAT}`, ...logArgs], cwd))
        .stdout
      if (stdout.includes('%(decorate')) {
        throw new GitLogDecorateFormatModifierUnsupportedSignal()
      }
      return stdout
    },
    async () =>
      (await git(['log', `--format=${GIT_HISTORY_COMMIT_FORMAT_FALLBACK}`, ...logArgs], cwd))
        .stdout,
    isLogDecorateFormatModifierUnsupportedError
  )
}

function buildHistoryRevisionArgs(
  headOid: string,
  options: Pick<GitHistoryOptions, 'refScope' | 'includeRemoteBranches'>
): string[] {
  if (options.refScope !== 'all') {
    // Why: HEAD-ancestry-only is the historical default every existing caller
    // relies on — keep it exact rather than folding it into the --all path.
    return [headOid]
  }
  // Why: explicit --branches/--tags/(--remotes) instead of --all so the
  // remote-branch toggle can drop remotes from the walk outright, without
  // needing an --exclude glob (a separate, newer capability). HEAD is
  // appended so a detached HEAD commit that is not an ancestor of any ref
  // still appears.
  return [
    '--branches',
    '--tags',
    ...(options.includeRemoteBranches === false ? [] : ['--remotes']),
    'HEAD'
  ]
}

async function resolveCommit(
  git: GitHistoryExecutor,
  cwd: string,
  ref: string
): Promise<string | null> {
  if (!ref || ref.startsWith('-')) {
    return null
  }
  try {
    const { stdout } = await git(
      ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
      cwd
    )
    const oid = stdout.trim()
    return oid || null
  } catch {
    return null
  }
}

async function resolveSymbolicFullName(
  git: GitHistoryExecutor,
  cwd: string,
  ref: string
): Promise<string | null> {
  if (!ref || ref.startsWith('-')) {
    return null
  }
  try {
    const { stdout } = await git(
      ['rev-parse', '--symbolic-full-name', '--end-of-options', ref],
      cwd
    )
    return stdout.trim().split(/\r?\n/).find(Boolean) ?? null
  } catch {
    return null
  }
}

async function resolveCurrentRef(
  git: GitHistoryExecutor,
  cwd: string,
  headOid: string
): Promise<{ currentRef: GitHistoryItemRef; branchName: string | null }> {
  try {
    const { stdout } = await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd)
    const branchName = stdout.trim()
    if (branchName) {
      return {
        branchName,
        currentRef: {
          id: `refs/heads/${branchName}`,
          name: branchName,
          revision: headOid,
          category: 'branches'
        }
      }
    }
  } catch {
    // Detached HEAD.
  }

  return {
    branchName: null,
    currentRef: { id: headOid, name: shortGitHash(headOid), revision: headOid, category: 'commits' }
  }
}

async function resolveUpstreamRef(
  git: GitHistoryExecutor,
  cwd: string,
  branchName: string | null
): Promise<GitHistoryItemRef | undefined> {
  if (!branchName) {
    return undefined
  }
  try {
    const { stdout } = await git(
      ['for-each-ref', '--format=%(upstream)%00%(upstream:short)', `refs/heads/${branchName}`],
      cwd
    )
    const [fullName, shortName] = stdout.split('\0')
    const upstreamRef = fullName?.trim()
    const upstreamShortName = shortName?.trim()
    if (!upstreamRef || !upstreamShortName) {
      return undefined
    }
    // Why: %(upstream:objectname) is not portable across Git versions; resolve
    // the upstream name first, then ask rev-parse for the commit object.
    const oid = await resolveCommit(git, cwd, upstreamRef)
    return oid ? gitHistoryRefFromFullName(upstreamRef, upstreamShortName, oid) : undefined
  } catch {
    return undefined
  }
}

async function resolveNamedRef(
  git: GitHistoryExecutor,
  cwd: string,
  ref: string | null | undefined
): Promise<GitHistoryItemRef | undefined> {
  const normalized = ref?.trim()
  if (!normalized || normalized.startsWith('-')) {
    return undefined
  }
  const [revision, fullName] = await Promise.all([
    resolveCommit(git, cwd, normalized),
    resolveSymbolicFullName(git, cwd, normalized)
  ])
  return revision ? gitHistoryRefFromFullName(fullName, normalized, revision) : undefined
}

export async function loadGitHistoryFromExecutor(
  git: GitHistoryExecutor,
  cwd: string,
  options: GitHistoryOptions = {},
  // Why: capability results (which decoration format the host's Git accepts)
  // are cheap to rediscover but should be cached per host — callers that talk
  // to a specific host (local/WSL/SSH/relay) pass their own scoped cache; a
  // fresh instance here just means no caching, not incorrect behavior.
  capabilities: GitCapabilityCache = new GitCapabilityCache()
): Promise<GitHistoryResult> {
  const limit = clampHistoryLimit(options.limit)
  const skip = clampHistorySkip(options.skip)
  const headOid = await resolveCommit(git, cwd, 'HEAD')
  if (!headOid) {
    return {
      items: [],
      hasIncomingChanges: false,
      hasOutgoingChanges: false,
      hasMore: false,
      limit
    }
  }

  const { currentRef, branchName } = await resolveCurrentRef(git, cwd, headOid)
  const [remoteRef, rawBaseRef] = await Promise.all([
    resolveUpstreamRef(git, cwd, branchName),
    resolveNamedRef(git, cwd, options.baseRef)
  ])

  const baseRef =
    rawBaseRef && rawBaseRef.id !== remoteRef?.id && rawBaseRef.id !== currentRef.id
      ? rawBaseRef
      : undefined

  // Why: default scope stays scoped to the active workspace's HEAD ancestry.
  // Upstream and base refs stay as comparison metadata so old workspaces do
  // not list newly fetched upstream/base commits. refScope: 'all' opts into
  // walking every branch/tag (and optionally remote branch) instead.
  const historyRevisions = buildHistoryRevisionArgs(headOid, options)

  let mergeBase: string | undefined
  if (remoteRef?.revision && currentRef.revision && remoteRef.revision !== currentRef.revision) {
    try {
      const { stdout } = await git(['merge-base', currentRef.revision, remoteRef.revision], cwd)
      mergeBase = stdout.trim() || undefined
    } catch {
      mergeBase = undefined
    }
  }

  const stdout = await runGitLog(
    git,
    cwd,
    [
      '-z',
      '--topo-order',
      '--decorate=full',
      `-n${limit + 1}`,
      ...(skip > 0 ? [`--skip=${skip}`] : []),
      ...historyRevisions
    ],
    capabilities
  )
  const parsed = parseGitHistoryLog(stdout)
  const items = parsed.slice(0, limit)
  const hasIncomingChanges =
    Boolean(remoteRef?.revision && mergeBase) && remoteRef?.revision !== mergeBase
  const hasOutgoingChanges =
    Boolean(currentRef.revision && remoteRef?.revision && mergeBase) &&
    currentRef.revision !== mergeBase

  return {
    items,
    currentRef,
    remoteRef,
    baseRef,
    mergeBase,
    hasIncomingChanges,
    hasOutgoingChanges,
    hasMore: parsed.length > limit,
    limit
  }
}
