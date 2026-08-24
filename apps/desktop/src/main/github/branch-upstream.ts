import { splitRemoteBranchName } from '~shared/git/effective-upstream'

import { gitExecFileAsync, type OwnerRepo } from './github-cli'
import { readLocalGitConfigSignature } from './local-git-config-signature'

export type TrackedUpstreamBranch = {
  remoteName: string
  branchName: string
}

export const TRACKED_UPSTREAM_SNAPSHOT_CACHE_TTL_MS = 30_000
export const TRACKED_UPSTREAM_SNAPSHOT_CACHE_MAX_ENTRIES = 512

export type TrackedUpstreamSnapshotCacheEntry = {
  expiresAt: number
  gitConfigSignature?: string
  upstreamsByBranchName: Map<string, TrackedUpstreamBranch | null>
}

export type TrackedUpstreamSnapshotProbeResult = {
  cacheable: boolean
  gitConfigSignature?: string
  probeFailed: boolean
  upstreamsByBranchName: Map<string, TrackedUpstreamBranch | null>
}

export const trackedUpstreamSnapshotCache = new Map<string, TrackedUpstreamSnapshotCacheEntry>()
export const trackedUpstreamSnapshotInFlight = new Map<
  string,
  Promise<TrackedUpstreamSnapshotProbeResult>
>()
export const trackedUpstreamSnapshotGenerations = new Map<string, symbol>()

export function beginTrackedUpstreamSnapshotProbe(cacheKey: string): symbol {
  const generation = Symbol()
  trackedUpstreamSnapshotGenerations.set(cacheKey, generation)
  return generation
}

export function finishTrackedUpstreamSnapshotProbe(cacheKey: string, generation: symbol): void {
  // Why: generations only guard an active probe; retaining completed repo keys
  // leaks worktree/runtime identities after the short-lived snapshot TTL expires.
  if (trackedUpstreamSnapshotGenerations.get(cacheKey) === generation) {
    trackedUpstreamSnapshotGenerations.delete(cacheKey)
  }
}

export function pruneTrackedUpstreamSnapshotCache(now: number): void {
  for (const [cacheKey, cached] of trackedUpstreamSnapshotCache) {
    if (cached.expiresAt <= now) {
      trackedUpstreamSnapshotCache.delete(cacheKey)
    }
  }
  // Why: workspace/runtime churn can create unbounded unique keys within one
  // TTL window, so expiry sweeping alone is not a memory bound.
  while (trackedUpstreamSnapshotCache.size > TRACKED_UPSTREAM_SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldestKey = trackedUpstreamSnapshotCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    trackedUpstreamSnapshotCache.delete(oldestKey)
  }
}

export function parseTrackedUpstreamBranch(upstreamRef: string): TrackedUpstreamBranch | null {
  const parsed = splitRemoteBranchName(upstreamRef.trim())
  if (!parsed) {
    return null
  }
  return parsed
}

export function prOwnerRepoKey(ownerRepo: OwnerRepo): string {
  return `${ownerRepo.owner.toLowerCase()}/${ownerRepo.repo.toLowerCase()}`
}

export function shouldRetryTrackedUpstreamBranch(
  upstreamBranch: TrackedUpstreamBranch,
  branchName: string,
  upstreamHeadRepo: OwnerRepo,
  headRepo: OwnerRepo | null
): boolean {
  if (upstreamBranch.branchName !== branchName) {
    return true
  }
  if (!headRepo) {
    return true
  }
  return prOwnerRepoKey(upstreamHeadRepo) !== prOwnerRepoKey(headRepo)
}

export async function getTrackedUpstreamBranch(
  repoPath: string,
  branchName: string,
  connectionId?: string | null,
  localGitOptions: { wslDistro?: string } = {}
): Promise<TrackedUpstreamBranch | null> {
  const cacheKey = getTrackedUpstreamBranchCacheKey(repoPath, connectionId, localGitOptions)
  const now = Date.now()
  const cached = trackedUpstreamSnapshotCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    const configSignatureMatches = await doesTrackedUpstreamCacheConfigSignatureMatch(
      cached,
      repoPath,
      connectionId,
      localGitOptions
    )
    if (
      configSignatureMatches &&
      cached.upstreamsByBranchName.has(branchName) &&
      canUseCachedTrackedUpstreamBranch(cached, branchName)
    ) {
      return cached.upstreamsByBranchName.get(branchName) ?? null
    }
    trackedUpstreamSnapshotCache.delete(cacheKey)
  }
  if (cached) {
    trackedUpstreamSnapshotCache.delete(cacheKey)
  }

  const inFlight = trackedUpstreamSnapshotInFlight.get(cacheKey)
  if (inFlight) {
    const result = await inFlight
    if (result.upstreamsByBranchName.has(branchName)) {
      return result.upstreamsByBranchName.get(branchName) ?? null
    }
    // Why: a concurrent snapshot may finish before this branch exists in git.
    // Re-probe instead of returning a one-shot synthetic null.
    const retryInFlight = trackedUpstreamSnapshotInFlight.get(cacheKey)
    if (retryInFlight) {
      const retryResult = await retryInFlight
      return retryResult.upstreamsByBranchName.get(branchName) ?? null
    }
  }

  // Why: PR polling can ask about hundreds of local worktree branches at once.
  // Read the branch upstream snapshot in one git process per repo/runtime
  // instead of spawning one failing `branch@{upstream}` probe per branch.
  const probeGeneration = beginTrackedUpstreamSnapshotProbe(cacheKey)
  const probe = probeTrackedUpstreamSnapshot(repoPath, connectionId, localGitOptions)
  trackedUpstreamSnapshotInFlight.set(cacheKey, probe)
  try {
    const result = await probe
    if (result.cacheable && trackedUpstreamSnapshotGenerations.get(cacheKey) === probeGeneration) {
      trackedUpstreamSnapshotCache.set(cacheKey, {
        ...(result.gitConfigSignature ? { gitConfigSignature: result.gitConfigSignature } : {}),
        upstreamsByBranchName: getCacheableTrackedUpstreamSnapshot(result.upstreamsByBranchName),
        expiresAt: Date.now() + TRACKED_UPSTREAM_SNAPSHOT_CACHE_TTL_MS
      })
      pruneTrackedUpstreamSnapshotCache(Date.now())
    }
    if (trackedUpstreamSnapshotGenerations.get(cacheKey) !== probeGeneration) {
      const fresherCached = trackedUpstreamSnapshotCache.get(cacheKey)
      if (fresherCached?.upstreamsByBranchName.has(branchName)) {
        return fresherCached.upstreamsByBranchName.get(branchName) ?? null
      }
    }
    return result.upstreamsByBranchName.get(branchName) ?? null
  } finally {
    if (trackedUpstreamSnapshotInFlight.get(cacheKey) === probe) {
      trackedUpstreamSnapshotInFlight.delete(cacheKey)
    }
    finishTrackedUpstreamSnapshotProbe(cacheKey, probeGeneration)
  }
}

export async function probeTrackedUpstreamSnapshot(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: { wslDistro?: string } = {}
): Promise<TrackedUpstreamSnapshotProbeResult> {
  const startingGitConfigSignature = await readLocalGitConfigSignature({
    repoPath,
    connectionId: connectionId ?? null,
    ...localGitOptions
  })
  const { probeFailed, upstreamsByBranchName } = await probeTrackedUpstreamBranches(
    repoPath,
    localGitOptions
  )
  const endingGitConfigSignature = await readLocalGitConfigSignature({
    repoPath,
    connectionId: connectionId ?? null,
    ...localGitOptions
  })
  const isLocalHostRuntime = !connectionId && !localGitOptions.wslDistro
  const configSignatureChanged =
    isLocalHostRuntime && startingGitConfigSignature !== endingGitConfigSignature
  const gitConfigSignature =
    startingGitConfigSignature === endingGitConfigSignature ? endingGitConfigSignature : undefined
  return {
    // Why: transient git failures must not cache an empty snapshot that forces
    // every branch lookup to delete and re-probe on the next refresh tick.
    cacheable: !configSignatureChanged && !probeFailed,
    probeFailed,
    ...(gitConfigSignature ? { gitConfigSignature } : {}),
    upstreamsByBranchName
  }
}

export function getCacheableTrackedUpstreamSnapshot(
  upstreamsByBranchName: Map<string, TrackedUpstreamBranch | null>
): Map<string, TrackedUpstreamBranch | null> {
  // Why: repeated PR refreshes should share one branch scan; the short TTL
  // bounds stale positives after upstream configuration changes.
  return upstreamsByBranchName
}

export function canUseCachedTrackedUpstreamBranch(
  cached: TrackedUpstreamSnapshotCacheEntry,
  branchName: string
): boolean {
  return cached.upstreamsByBranchName.has(branchName)
}

export async function doesTrackedUpstreamCacheConfigSignatureMatch(
  cached: TrackedUpstreamSnapshotCacheEntry,
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: { wslDistro?: string } = {}
): Promise<boolean> {
  if (!cached.gitConfigSignature) {
    return true
  }
  const currentSignature = await readLocalGitConfigSignature({
    repoPath,
    connectionId: connectionId ?? null,
    ...localGitOptions
  })
  return currentSignature === cached.gitConfigSignature
}

export function getTrackedUpstreamBranchCacheKey(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: { wslDistro?: string } = {}
): string {
  const runtimeKey = connectionId
    ? `connection:${connectionId}`
    : `local:${localGitOptions.wslDistro ?? 'host'}`
  return [runtimeKey, repoPath].join('\0')
}

export async function probeTrackedUpstreamBranches(
  repoPath: string,
  localGitOptions: { wslDistro?: string } = {}
): Promise<{
  probeFailed: boolean
  upstreamsByBranchName: Map<string, TrackedUpstreamBranch | null>
}> {
  const args = ['for-each-ref', '--format=%(refname)%00%(upstream)', 'refs/heads']
  try {
    const result = await gitExecFileAsync(args, {
      cwd: repoPath,
      ...(localGitOptions.wslDistro ? { wslDistro: localGitOptions.wslDistro } : {})
    })
    return {
      probeFailed: false,
      upstreamsByBranchName: parseTrackedUpstreamBranches(result.stdout)
    }
  } catch {
    return { probeFailed: true, upstreamsByBranchName: new Map() }
  }
}

export function parseTrackedUpstreamBranches(
  stdout: string
): Map<string, TrackedUpstreamBranch | null> {
  const upstreamsByBranchName = new Map<string, TrackedUpstreamBranch | null>()
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) {
      continue
    }
    const [branchName, upstreamRef] = line.split('\0')
    const localBranchName = branchName?.replace(/^refs\/heads\//, '')
    if (!localBranchName) {
      continue
    }
    upstreamsByBranchName.set(localBranchName, parseTrackedUpstreamRef(upstreamRef ?? ''))
  }
  return upstreamsByBranchName
}

export function parseTrackedUpstreamRef(upstreamRef: string): TrackedUpstreamBranch | null {
  const remoteRefPrefix = 'refs/remotes/'
  const normalizedRef = upstreamRef.trim()
  if (normalizedRef.startsWith(remoteRefPrefix)) {
    return parseTrackedUpstreamBranch(normalizedRef.slice(remoteRefPrefix.length))
  }
  if (normalizedRef.startsWith('refs/heads/')) {
    return null
  }
  return parseTrackedUpstreamBranch(normalizedRef)
}
