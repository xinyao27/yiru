import type { GitUpstreamStatus } from '@yiru/runtime-protocol/workbench/types'
import {
  getEffectiveGitUpstreamStatus,
  getGitUpstreamStatusForUpstreamName,
  splitRemoteBranchName
} from '~main/git/repo/effective-upstream'
import { createGitConfigSnapshotRunner } from '~main/git/runner/config-snapshot-runner'

import { gitExecFileAsync } from '../runner/runner'
import type { GitRuntimeOptions } from '../runner/runtime-options'
import { gitOptionsForWorktree } from '../runner/runtime-options'

const NEGATIVE_CACHE_TTL_MS = 5 * 60_000
const MAX_NEGATIVE_CACHE_ENTRIES = 512
const RESOLVED_NAME_CACHE_TTL_MS = 60_000

type EffectiveUpstreamStatusCacheEntry = {
  expiresAt: number
  status: GitUpstreamStatus
}
type ResolvedUpstreamNameCacheEntry = {
  upstreamName: string
  expiresAt: number
}

const resolvedUpstreamNameCache = new Map<string, ResolvedUpstreamNameCacheEntry>()
const effectiveUpstreamStatusCache = new Map<string, EffectiveUpstreamStatusCacheEntry>()
const effectiveUpstreamStatusInFlight = new Map<string, Promise<GitUpstreamStatus>>()
const retiredEffectiveUpstreamStatusInFlight = new Map<string, Promise<GitUpstreamStatus>>()
const effectiveUpstreamStatusWriteGeneration = new Map<string, number>()

export function clearResolvedUpstreamNameCache(): void {
  resolvedUpstreamNameCache.clear()
}

export function getShortBranchName(branch: string | undefined): string | null {
  const prefix = 'refs/heads/'
  return branch?.startsWith(prefix) ? branch.slice(prefix.length) : null
}

export function getEffectiveUpstreamStatusCacheKey(
  worktreePath: string,
  branchName: string,
  upstreamName: string | undefined,
  options: GitRuntimeOptions = {}
): string {
  return [worktreePath, options.wslDistro ?? 'host', branchName, upstreamName ?? ''].join('\0')
}

function hasPendingEffectiveUpstreamStatusProbe(cacheKey: string): boolean {
  return (
    effectiveUpstreamStatusInFlight.has(cacheKey) ||
    retiredEffectiveUpstreamStatusInFlight.has(cacheKey)
  )
}

function trimEffectiveUpstreamStatusGeneration(): void {
  for (const cacheKey of effectiveUpstreamStatusWriteGeneration.keys()) {
    if (effectiveUpstreamStatusWriteGeneration.size <= MAX_NEGATIVE_CACHE_ENTRIES) {
      break
    }
    if (hasPendingEffectiveUpstreamStatusProbe(cacheKey)) {
      continue
    }
    effectiveUpstreamStatusWriteGeneration.delete(cacheKey)
  }
}

function readCachedEffectiveUpstreamStatus(
  cacheKey: string,
  now: number
): GitUpstreamStatus | undefined {
  const entry = effectiveUpstreamStatusCache.get(cacheKey)
  if (!entry) {
    return undefined
  }
  if (entry.expiresAt <= now) {
    effectiveUpstreamStatusCache.delete(cacheKey)
    return undefined
  }
  return entry.status
}

function rememberEffectiveUpstreamStatus(
  cacheKey: string,
  status: GitUpstreamStatus,
  now: number,
  probedSameNameOriginRef: boolean,
  writeGeneration: number
): void {
  // Why: hasConfiguredPushTarget gates a write action. Re-probe it each poll
  // rather than keeping a stale positive target after branch config changes.
  if (status.hasUpstream || status.hasConfiguredPushTarget) {
    effectiveUpstreamStatusCache.delete(cacheKey)
    effectiveUpstreamStatusWriteGeneration.set(cacheKey, writeGeneration + 1)
    trimEffectiveUpstreamStatusGeneration()
    return
  }
  if ((effectiveUpstreamStatusWriteGeneration.get(cacheKey) ?? 0) !== writeGeneration) {
    return
  }
  if (!probedSameNameOriginRef) {
    return
  }
  // Why: a stable no-upstream branch should not spawn failed git probes every
  // source-control poll, but remote refs can appear after push/fetch.
  effectiveUpstreamStatusCache.set(cacheKey, {
    status,
    expiresAt: now + NEGATIVE_CACHE_TTL_MS
  })
  while (effectiveUpstreamStatusCache.size > MAX_NEGATIVE_CACHE_ENTRIES) {
    const oldest = effectiveUpstreamStatusCache.keys().next()
    if (oldest.done) {
      break
    }
    effectiveUpstreamStatusCache.delete(oldest.value)
    effectiveUpstreamStatusWriteGeneration.delete(oldest.value)
  }
  trimEffectiveUpstreamStatusGeneration()
}

export async function readOrProbeEffectiveUpstreamStatus(
  cacheKey: string,
  worktreePath: string,
  branchName: string,
  options: GitRuntimeOptions = {},
  bypassCache = false
): Promise<GitUpstreamStatus> {
  if (!bypassCache) {
    const cached = readCachedEffectiveUpstreamStatus(cacheKey, Date.now())
    if (cached) {
      return cached
    }

    const inFlight = effectiveUpstreamStatusInFlight.get(cacheKey)
    if (inFlight) {
      return inFlight
    }
  }

  // Why: source-control mount and root git refresh can overlap during startup.
  // Coalesce the richer upstream probe so a stable missing ref fails once.
  const writeGeneration = effectiveUpstreamStatusWriteGeneration.get(cacheKey) ?? 0
  const probe = probeOrRevalidateEffectiveUpstreamStatus(
    cacheKey,
    worktreePath,
    branchName,
    options,
    bypassCache
  ).then((result) => {
    rememberEffectiveUpstreamStatus(
      cacheKey,
      result.status,
      Date.now(),
      result.probedSameNameOriginRef,
      writeGeneration
    )
    return result.status
  })
  if (!bypassCache) {
    effectiveUpstreamStatusInFlight.set(cacheKey, probe)
  }
  try {
    return await probe
  } finally {
    if (effectiveUpstreamStatusInFlight.get(cacheKey) === probe) {
      effectiveUpstreamStatusInFlight.delete(cacheKey)
      trimEffectiveUpstreamStatusGeneration()
    }
  }
}

async function probeOrRevalidateEffectiveUpstreamStatus(
  cacheKey: string,
  worktreePath: string,
  branchName: string,
  options: GitRuntimeOptions = {},
  bypassCache = false
): Promise<{ status: GitUpstreamStatus; probedSameNameOriginRef: boolean }> {
  const now = Date.now()
  const cached = resolvedUpstreamNameCache.get(cacheKey)
  if (cached && (bypassCache || cached.expiresAt <= now)) {
    resolvedUpstreamNameCache.delete(cacheKey)
  } else if (cached) {
    try {
      const status = await getGitUpstreamStatusForUpstreamName(
        (args) => gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options)),
        cached.upstreamName
      )
      return { status, probedSameNameOriginRef: false }
    } catch (error) {
      // Why: an aborted probe says nothing about the ref; evicting the warm
      // name cache here would force a pointless full re-resolve next scan.
      if (options.signal?.aborted) {
        throw error
      }
      // Ref deleted or repo state changed — fall through to a full re-resolve.
      resolvedUpstreamNameCache.delete(cacheKey)
    }
  }
  const result = await probeEffectiveUpstreamStatus(worktreePath, branchName, options)
  if (result.status.hasUpstream && result.status.upstreamName) {
    resolvedUpstreamNameCache.set(cacheKey, {
      upstreamName: result.status.upstreamName,
      expiresAt: Date.now() + RESOLVED_NAME_CACHE_TTL_MS
    })
    while (resolvedUpstreamNameCache.size > MAX_NEGATIVE_CACHE_ENTRIES) {
      const oldest = resolvedUpstreamNameCache.keys().next()
      if (oldest.done) {
        break
      }
      resolvedUpstreamNameCache.delete(oldest.value)
    }
  }
  return result
}

async function probeEffectiveUpstreamStatus(
  worktreePath: string,
  branchName: string,
  options: GitRuntimeOptions = {}
): Promise<{ status: GitUpstreamStatus; probedSameNameOriginRef: boolean }> {
  let probedSameNameOriginRef = false
  const snapshotRunner = createGitConfigSnapshotRunner((args) =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  )
  const status = await getEffectiveGitUpstreamStatus((args) => {
    if (args[0] === 'rev-parse' && args.includes(`refs/remotes/origin/${branchName}`)) {
      probedSameNameOriginRef = true
    }
    return snapshotRunner(args)
  })
  return { status, probedSameNameOriginRef }
}

export function shouldProbeEffectiveUpstreamStatus(
  branch: string | undefined,
  upstreamName: string | undefined
): boolean {
  const branchName = getShortBranchName(branch)
  if (!branchName) {
    return false
  }
  if (!upstreamName) {
    return true
  }
  const parsed = splitRemoteBranchName(upstreamName)
  return parsed?.remoteName === 'origin' && parsed.branchName !== branchName
}
