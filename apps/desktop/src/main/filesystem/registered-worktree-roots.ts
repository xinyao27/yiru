import { resolve } from 'node:path'

import type { Store } from '../persistence'
import { isRepoRoot, listRepoWorktrees } from '../repo-worktrees'
import { getLocalRepos } from './allowed-roots'
import { isDescendantOrEqual, normalizeExistingPath } from './path-containment'

const registeredWorktreeRoots = new Set<string>()
const registeredWorktreeRootsByRepo = new Map<string, Set<string>>()
const registeredWorktreeRootRepoIds = new Set<string>()
const AUTHORIZED_ROOTS_REBUILD_CONCURRENCY = 8
let registeredWorktreeRootsDirty = true
let registeredWorktreeRootsRefresh: Promise<void> | null = null

export function invalidateAuthorizedRootsCache(): void {
  registeredWorktreeRootsDirty = true
  // Why: dirty roots cannot be trusted for auth short-circuits. Fresh
  // worktrees:list results will seed safe per-repo roots before a full rebuild.
  registeredWorktreeRoots.clear()
  registeredWorktreeRootsByRepo.clear()
  registeredWorktreeRootRepoIds.clear()
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrent: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0
  const workerCount = Math.min(maxConcurrent, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index])
      }
    })
  )
  return results
}

export async function rebuildAuthorizedRootsCache(store: Store): Promise<void> {
  // Why: bounded parallelism keeps the Windows speedup without spawning one git
  // process per repo. Avoid realpath here because background canonicalization
  // can prompt for macOS privacy access; handlers canonicalize active targets.
  const repos = getLocalRepos(store)
  const perProjectResults = await mapWithConcurrency(
    repos,
    AUTHORIZED_ROOTS_REBUILD_CONCURRENCY,
    async (repo) => {
      const roots: string[] = []
      try {
        roots.push(resolve(repo.path))
        for (const worktree of await listRepoWorktrees(repo)) {
          roots.push(resolve(worktree.path))
        }
      } catch (error) {
        // Why: one inaccessible repo must not disable file access for all others.
        console.warn(`[filesystem-auth] skipping repo ${repo.path} during cache rebuild:`, error)
      }
      return { repoId: repo.id, roots }
    }
  )

  registeredWorktreeRoots.clear()
  registeredWorktreeRootsByRepo.clear()
  registeredWorktreeRootRepoIds.clear()
  for (const { repoId, roots } of perProjectResults) {
    const normalizedRoots = new Set<string>()
    for (const root of roots) {
      normalizedRoots.add(root)
      registeredWorktreeRoots.add(root)
    }
    registeredWorktreeRootsByRepo.set(repoId, normalizedRoots)
    registeredWorktreeRootRepoIds.add(repoId)
  }
  registeredWorktreeRootsDirty = false
}

function refreshRegisteredWorktreeRoots(): void {
  registeredWorktreeRoots.clear()
  for (const roots of registeredWorktreeRootsByRepo.values()) {
    for (const root of roots) {
      registeredWorktreeRoots.add(root)
    }
  }
}

function allLocalRepoRootsRegistered(localRepoIds: Set<string>): boolean {
  for (const repoId of localRepoIds) {
    if (!registeredWorktreeRootRepoIds.has(repoId)) {
      return false
    }
  }
  return true
}

export function registerWorktreeRootsForRepo(
  store: Store,
  repoId: string,
  worktreeRoots: string[]
): void {
  const localRepoIds = new Set(getLocalRepos(store).map((repo) => repo.id))
  for (const registeredRepoId of registeredWorktreeRootsByRepo.keys()) {
    if (!localRepoIds.has(registeredRepoId)) {
      registeredWorktreeRootsByRepo.delete(registeredRepoId)
      registeredWorktreeRootRepoIds.delete(registeredRepoId)
    }
  }

  if (!localRepoIds.has(repoId)) {
    refreshRegisteredWorktreeRoots()
    registeredWorktreeRootsDirty = !allLocalRepoRootsRegistered(localRepoIds)
    return
  }

  registeredWorktreeRootsByRepo.set(repoId, new Set(worktreeRoots.map((root) => resolve(root))))
  registeredWorktreeRootRepoIds.add(repoId)
  refreshRegisteredWorktreeRoots()
  registeredWorktreeRootsDirty = !allLocalRepoRootsRegistered(localRepoIds)
}

export async function ensureAuthorizedRootsCache(store: Store): Promise<void> {
  if (!registeredWorktreeRootsDirty) {
    return
  }
  if (!registeredWorktreeRootsRefresh) {
    registeredWorktreeRootsRefresh = rebuildAuthorizedRootsCache(store).finally(() => {
      registeredWorktreeRootsRefresh = null
    })
  }
  await registeredWorktreeRootsRefresh
}

export function isRegisteredWorktreePath(targetPath: string): boolean {
  for (const root of registeredWorktreeRoots) {
    if (isDescendantOrEqual(targetPath, root)) {
      return true
    }
  }
  return false
}

function findRegisteredWorktreeRoot(targetPath: string): string | null {
  let bestRoot: string | null = null
  for (const root of registeredWorktreeRoots) {
    if (!isDescendantOrEqual(targetPath, root)) {
      continue
    }
    if (!bestRoot || root.length > bestRoot.length) {
      bestRoot = root
    }
  }
  return bestRoot
}

export async function isPathAllowedByCanonicalRegisteredRoot(
  targetPath: string,
  sourcePath: string | undefined
): Promise<boolean> {
  if (!sourcePath) {
    return false
  }
  const textualRoot = findRegisteredWorktreeRoot(sourcePath)
  if (!textualRoot) {
    return false
  }
  const canonicalRoot = await normalizeExistingPath(textualRoot)
  if (!isDescendantOrEqual(targetPath, canonicalRoot)) {
    return false
  }
  // Why: background refresh avoids realpath to prevent macOS privacy prompts.
  // Cache only the root the user is actively accessing for path aliases.
  registeredWorktreeRoots.add(canonicalRoot)
  return true
}

export async function resolveRegisteredWorktreePath(
  worktreePath: string,
  store: Store
): Promise<string> {
  if (!worktreePath || worktreePath.includes('\0')) {
    throw new Error('Access denied: invalid worktree path')
  }

  const resolvedTarget = resolve(worktreePath)
  if (registeredWorktreeRoots.has(resolvedTarget) || isRepoRoot(store.getRepos(), resolvedTarget)) {
    return resolvedTarget
  }
  if (registeredWorktreeRootsDirty) {
    await ensureAuthorizedRootsCache(store)
  }
  if (registeredWorktreeRoots.has(resolvedTarget)) {
    return resolvedTarget
  }

  // Why: defer realpath until the cheap check to avoid unnecessary macOS TCC prompts.
  const normalizedTarget = await normalizeExistingPath(resolvedTarget)
  if (registeredWorktreeRoots.has(normalizedTarget)) {
    return normalizedTarget
  }
  throw new Error('Access denied: unknown repository or worktree path')
}
