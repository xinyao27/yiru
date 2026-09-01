import { gitExecFileAsync, gitOptionalLocksDisabledEnv } from '../runner/runner'
import type { GitRuntimeOptions } from '../runner/runtime-options'
import { gitOptionsForWorktree } from '../runner/runtime-options'

const CACHE_TTL_MS = 5_000
const MAX_CACHE_ENTRIES = 512
type SubmodulePathsCacheEntry = { paths: string[]; expiresAt: number }
const submodulePathsCache = new Map<string, SubmodulePathsCacheEntry>()
let cacheGeneration = 0

export function clearSubmodulePathsCache(): void {
  submodulePathsCache.clear()
  // Why: a pre-mutation .gitmodules read must not repopulate the cache after
  // the mutation invalidated it.
  cacheGeneration += 1
}

function getCacheKey(worktreePath: string, options: GitRuntimeOptions): string {
  // Why: the same path can address different filesystem views across WSL
  // distros, so the cache follows runtime routing.
  return [worktreePath, options.wslDistro ?? null].join('\0')
}

function pruneExpired(now: number): void {
  for (const [cacheKey, entry] of submodulePathsCache) {
    if (entry.expiresAt <= now) {
      submodulePathsCache.delete(cacheKey)
    }
  }
}

function remember(cacheKey: string, paths: string[], now: number): void {
  submodulePathsCache.delete(cacheKey)
  submodulePathsCache.set(cacheKey, { paths, expiresAt: now + CACHE_TTL_MS })
  while (submodulePathsCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = submodulePathsCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    submodulePathsCache.delete(oldestKey)
  }
}

export async function listSubmodulePaths(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<string[]> {
  const now = Date.now()
  const cacheKey = getCacheKey(worktreePath, options)
  const cached = submodulePathsCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    submodulePathsCache.delete(cacheKey)
    submodulePathsCache.set(cacheKey, cached)
    return cached.paths
  }
  if (cached) {
    submodulePathsCache.delete(cacheKey)
  }
  pruneExpired(now)
  const readGeneration = cacheGeneration
  let paths: string[] = []
  try {
    const { stdout } = await gitExecFileAsync(
      ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'],
      { ...gitOptionsForWorktree(worktreePath, options), env: gitOptionalLocksDisabledEnv() }
    )
    paths = stdout
      .split(/\r?\n/)
      .map((line) => {
        const spaceIndex = line.indexOf(' ')
        return spaceIndex === -1
          ? ''
          : line
              .slice(spaceIndex + 1)
              .trim()
              .replace(/\/+$/, '')
      })
      .filter((value) => value.length > 0)
  } catch {
    paths = []
  }
  if (readGeneration === cacheGeneration) {
    remember(cacheKey, paths, Date.now())
  }
  return paths
}

export function findContainingSubmodule(submodulePaths: string[], filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  let best: string | null = null
  for (const submodulePath of submodulePaths) {
    if (
      (normalized === submodulePath || normalized.startsWith(`${submodulePath}/`)) &&
      (!best || submodulePath.length > best.length)
    ) {
      best = submodulePath
    }
  }
  return best
}
