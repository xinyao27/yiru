import type {
  GitStatusEntry,
  GitStatusResult,
  GitUpstreamStatus
} from '@yiru/runtime-protocol/workbench/types'
import { DEFAULT_GIT_STATUS_LIMIT } from '~main/git/status/status-limit'
import {
  beginGitStatusLineStatsCacheWrite,
  clearGitStatusLineStatsCacheKey,
  reuseOrRecomputeGitStatusLineStats
} from '~main/git/status/status-line-stats-cache'
import { findExistingWorktreeSymlinkPaths } from '~main/worktree/symlink-detection'

import { gitOptionalLocksDisabledEnv, gitStreamStdout } from '../runner/runner'
import type { GitRuntimeOptions } from '../runner/runtime-options'
import { gitDiffReadDedupe, statusReadsInFlight } from './cache'
import { detectConflictOperation, parseUnmergedEntry } from './conflict'
import { attachLineStats, getStatusLineStatsCacheKey } from './line-stats'
import { StatusPorcelainParser } from './status-porcelain-parser'
import {
  getEffectiveUpstreamStatusCacheKey,
  getShortBranchName,
  readOrProbeEffectiveUpstreamStatus,
  shouldProbeEffectiveUpstreamStatus
} from './upstream-status'

export type GetStatusOptions = GitRuntimeOptions & {
  includeIgnored?: boolean
  reuseLineStats?: boolean
  limit?: number
  bypassEffectiveUpstreamNegativeCache?: boolean
  sharedLinkPaths?: readonly string[]
}

export async function getStatus(
  worktreePath: string,
  options: GetStatusOptions = {}
): Promise<GitStatusResult> {
  gitDiffReadDedupe.clear()
  if (options.signal) {
    return runGetStatus(worktreePath, options)
  }
  // Why: dedupe only concurrent identical reads; after settle, callers must
  // execute a fresh status read rather than observing a cached result.
  const cacheKey = getStatusReadKey(worktreePath, options)
  const inFlightStatus = statusReadsInFlight.get(cacheKey)
  if (inFlightStatus) {
    return inFlightStatus
  }

  const statusPromise = runGetStatus(worktreePath, options)
  statusReadsInFlight.set(cacheKey, statusPromise)
  try {
    return await statusPromise
  } finally {
    if (statusReadsInFlight.get(cacheKey) === statusPromise) {
      statusReadsInFlight.delete(cacheKey)
    }
  }
}

function getStatusReadKey(worktreePath: string, options: GetStatusOptions): string {
  // Why: each key part can change the output shape or runtime routing.
  const limit =
    typeof options.limit === 'number' && Number.isInteger(options.limit) && options.limit >= 0
      ? options.limit
      : DEFAULT_GIT_STATUS_LIMIT
  return [
    worktreePath,
    options.wslDistro ?? '',
    options.includeIgnored === true,
    options.reuseLineStats === true,
    options.bypassEffectiveUpstreamNegativeCache === true,
    limit,
    (options.sharedLinkPaths ?? []).join('\u0001')
  ].join('\0')
}

async function dropSharedSymlinkUntrackedEntries(
  worktreePath: string,
  entries: GitStatusEntry[],
  sharedLinkPaths: readonly string[]
): Promise<void> {
  if (sharedLinkPaths.length === 0 || !entries.some((entry) => entry.area === 'untracked')) {
    return
  }
  const sharedLinks = new Set(await findExistingWorktreeSymlinkPaths(worktreePath, sharedLinkPaths))
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.area === 'untracked' && sharedLinks.has(entry.path)) {
      entries.splice(index, 1)
    }
  }
}

async function runGetStatus(
  worktreePath: string,
  options: GetStatusOptions = {}
): Promise<GitStatusResult> {
  const lineStatsCacheKey = getStatusLineStatsCacheKey(worktreePath, options)
  const lineStatsWriteToken = beginGitStatusLineStatsCacheWrite(lineStatsCacheKey)
  let effectiveUpstreamStatus: GitUpstreamStatus | undefined
  let statusSucceeded = false
  // Why: a negative/fractional/NaN limit would trigger spurious early-stop or
  // inconsistent truncation; fall back to the default unless it's a valid
  // non-negative integer (0 explicitly disables the cap).
  const limit =
    typeof options.limit === 'number' && Number.isInteger(options.limit) && options.limit >= 0
      ? options.limit
      : DEFAULT_GIT_STATUS_LIMIT

  // Why: detectConflictOperation (4 existsSync + readFile) and git status are
  // independent. Running them concurrently saves one round-trip of I/O latency.
  const conflictPromise = detectConflictOperation(worktreePath)
  // Why: -c core.quotePath=false keeps non-ASCII filenames (Japanese, emoji,
  // etc.) as raw UTF-8 instead of git's default C-style octal escapes wrapped
  // in double quotes. Without it, the parsed entry.path is unreadable in the
  // sidebar and downstream `git show :"docs/\346..."` lookups silently miss.
  const statusArgs = [
    '-c',
    'core.quotePath=false',
    'status',
    '--porcelain=v2',
    '--branch',
    '--untracked-files=all'
  ]
  if (options.includeIgnored) {
    statusArgs.push('--ignored=matching')
  }

  // Why: stream + parse incrementally and stop git the moment the entry count
  // crosses `limit`, so a repo with an enormous un-ignored folder never buffers
  // a status listing big enough to crash the process. See StatusPorcelainParser.
  const parser = new StatusPorcelainParser()
  let didHitLimit = false
  const conflictOperation = await conflictPromise

  try {
    const { stoppedEarly } = await gitStreamStdout(statusArgs, {
      cwd: worktreePath,
      wslDistro: options.wslDistro,
      // Why: status polling is read-like; avoid refreshing the index and racing
      // terminal Git commands on `.git/worktrees/*/index.lock`.
      env: gitOptionalLocksDisabledEnv(),
      signal: options.signal,
      onStdout: (chunk) => parser.update(chunk, limit)
    })
    if (!stoppedEarly) {
      parser.finish()
    }
    didHitLimit = stoppedEarly
    statusSucceeded = true
  } catch (error) {
    // Why: an aborted scan must reject, not resolve — swallowing here would let
    // a cancelled request be mistaken for a completed (empty) status result.
    if (options.signal?.aborted) {
      throw error
    }
    // Not a git repo or git not available
  }

  // Why: the parser stops one entry past the limit (it checks after pushing), so
  // trim back to exactly `limit` for a stable "first N shown" contract.
  const entries = didHitLimit ? parser.entries.slice(0, limit) : parser.entries
  const { head, branch, upstreamName, upstreamAheadBehind } = parser.branch

  // Why: unmerged (`u`) records need async per-file git lookups, so the parser
  // collected their raw lines; resolve them now. Conflicts are rare and never
  // the source of huge output, so this stays off the streamed hot path.
  if (!didHitLimit) {
    for (const line of parser.unmergedLines) {
      const unmergedEntry = await parseUnmergedEntry(worktreePath, line)
      if (unmergedEntry) {
        entries.push(unmergedEntry)
      }
    }
  }

  await dropSharedSymlinkUntrackedEntries(worktreePath, entries, options.sharedLinkPaths ?? [])

  if (statusSucceeded && !didHitLimit && shouldProbeEffectiveUpstreamStatus(branch, upstreamName)) {
    const branchName = getShortBranchName(branch)
    if (branchName) {
      const cacheKey = getEffectiveUpstreamStatusCacheKey(
        worktreePath,
        branchName,
        upstreamName,
        options
      )
      try {
        // Why: the probe promise and its name/negative caches are shared by
        // concurrent status reads, so one caller's abort must not reject the
        // shared probe or evict warm cache state for the others. The probe is
        // small and its cached result stays useful, so run it unbound from
        // this request's signal.
        const { signal: _requestSignal, ...sharedProbeOptions } = options
        effectiveUpstreamStatus = await readOrProbeEffectiveUpstreamStatus(
          cacheKey,
          worktreePath,
          branchName,
          sharedProbeOptions,
          options.bypassEffectiveUpstreamNegativeCache === true
        )
      } catch {
        // Why: git status polling should not fail just because the richer
        // upstream probe hit a transient ref/read error; the explicit
        // upstream-status path will surface those failures when invoked.
      }
    }
  }

  // Why: attach per-area line counts for the sidebar. Diffs run after status
  // (we need the entry list first) and only for areas that have entries, so a
  // clean tree costs zero extra git calls. Skipped when the limit was hit —
  // running numstat over a huge change set would reintroduce the cost the limit
  // exists to avoid, matching how a "huge" repo disables extra git features.
  if (!didHitLimit) {
    await reuseOrRecomputeGitStatusLineStats({
      cacheKey: lineStatsCacheKey,
      head,
      entries,
      writeToken: lineStatsWriteToken,
      reuse: options.reuseLineStats === true,
      isAborted: () => options.signal?.aborted === true,
      recompute: () => attachLineStats(worktreePath, entries, options)
    })
  } else {
    clearGitStatusLineStatsCacheKey(lineStatsCacheKey, lineStatsWriteToken)
  }

  // Why: abort after the stream (e.g. during unmerged/upstream/line-stats work)
  // must still reject — never resolve a cancelled scan as a completed result.
  if (options.signal?.aborted) {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    throw error
  }

  return {
    entries,
    conflictOperation,
    head,
    branch,
    ...(options.includeIgnored ? { ignoredPaths: parser.ignoredPaths } : {}),
    ...(didHitLimit ? { didHitLimit: true, statusLength: parser.statusLength } : {}),
    ...(statusSucceeded
      ? {
          upstreamStatus:
            effectiveUpstreamStatus ??
            (upstreamName
              ? {
                  hasUpstream: true,
                  upstreamName,
                  ahead: upstreamAheadBehind?.ahead ?? 0,
                  behind: upstreamAheadBehind?.behind ?? 0
                }
              : { hasUpstream: false, ahead: 0, behind: 0 })
        }
      : {})
  }
}
