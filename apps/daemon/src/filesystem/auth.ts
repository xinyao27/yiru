import { realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'

import type { Store } from '../persistence/store'
import { getAllowedRoots } from './allowed-roots'
import { isDescendantOrEqual, isENOENT, normalizeExistingPath } from './path-containment'
import {
  ensureAuthorizedRootsCache,
  isPathAllowedByCanonicalRegisteredRoot,
  isRegisteredWorktreePath
} from './registered-worktree-roots'

export { getAllowedRoots } from './allowed-roots'
export { isDescendantOrEqual, isENOENT } from './path-containment'
export {
  ensureAuthorizedRootsCache,
  invalidateAuthorizedRootsCache,
  rebuildAuthorizedRootsCache,
  registerWorktreeRootsForRepo,
  resolveRegisteredWorktreePath
} from './registered-worktree-roots'

export const PATH_ACCESS_DENIED_MESSAGE =
  'Access denied: path resolves outside allowed directories. If this blocks a legitimate workflow, please file a GitHub issue.'

// Why: every caller re-authorizes immediately before operating, so LRU eviction
// bounds both session memory and the O(n) authorization scan without weakening
// the security seam.
export const AUTHORIZED_EXTERNAL_PATHS_MAX = 4096
const authorizedExternalPaths = new Set<string>()

function rememberAuthorizedExternalPath(path: string): void {
  authorizedExternalPaths.delete(path)
  authorizedExternalPaths.add(path)
  while (authorizedExternalPaths.size > AUTHORIZED_EXTERNAL_PATHS_MAX) {
    const oldest = authorizedExternalPaths.keys().next().value
    if (oldest === undefined) {
      break
    }
    authorizedExternalPaths.delete(oldest)
  }
}

export function authorizeExternalPath(targetPath: string): void {
  const resolvedTarget = resolve(targetPath)
  rememberAuthorizedExternalPath(resolvedTarget)
  try {
    // Why: macOS canonicalizes /tmp to /private/tmp during read authorization.
    rememberAuthorizedExternalPath(realpathSync(resolvedTarget))
  } catch {}
}

export function isPathAllowed(targetPath: string, store: Store): boolean {
  const resolvedTarget = resolve(targetPath)
  if (authorizedExternalPaths.has(resolvedTarget)) {
    return true
  }
  for (const authorizedPath of authorizedExternalPaths) {
    if (isDescendantOrEqual(resolvedTarget, authorizedPath)) {
      return true
    }
  }
  return getAllowedRoots(store).some((root) => isDescendantOrEqual(resolvedTarget, root))
}

export type ResolveAuthorizedPathOptions = {
  // Why: delete and rename must target a symlink leaf rather than following it
  // to a potentially external or separately tracked destination.
  preserveSymlink?: boolean
}

export async function resolveAuthorizedPath(
  targetPath: string,
  store: Store,
  options: ResolveAuthorizedPathOptions = {}
): Promise<string> {
  const resolvedTarget = resolve(targetPath)
  if (!(await isPathAllowedIncludingRegisteredWorktrees(resolvedTarget, store))) {
    throw new Error(PATH_ACCESS_DENIED_MESSAGE)
  }

  if (options.preserveSymlink) {
    let realParent: string
    try {
      realParent = await realpath(dirname(resolvedTarget))
    } catch (error) {
      if (isENOENT(error)) {
        return resolveAuthorizedMissingPath(resolvedTarget, store)
      }
      throw error
    }
    const candidateTarget = resolve(realParent, basename(resolvedTarget))
    if (
      !(await isPathAllowedIncludingRegisteredWorktrees(candidateTarget, store, {
        canonicalSourcePath: resolvedTarget
      }))
    ) {
      throw new Error(PATH_ACCESS_DENIED_MESSAGE)
    }
    return candidateTarget
  }

  try {
    // Why: Windows/WSL realpath can return UNC-shaped paths that still need to
    // compare against the resolved allow-list roots used by this module.
    const realTarget = resolve(await realpath(resolvedTarget))
    if (
      !(await isPathAllowedIncludingRegisteredWorktrees(realTarget, store, {
        canonicalSourcePath: resolvedTarget
      }))
    ) {
      throw new Error(PATH_ACCESS_DENIED_MESSAGE)
    }
    return realTarget
  } catch (error) {
    if (!isENOENT(error)) {
      throw error
    }
    return resolveAuthorizedMissingPath(resolvedTarget, store)
  }
}

async function resolveAuthorizedMissingPath(resolvedTarget: string, store: Store): Promise<string> {
  let existingAncestor = resolvedTarget
  const missingSegments: string[] = []

  while (true) {
    try {
      const realAncestor = await realpath(existingAncestor)
      const candidateTarget = resolve(realAncestor, ...missingSegments)
      if (
        !(await isPathAllowedIncludingRegisteredWorktrees(candidateTarget, store, {
          canonicalSourcePath: resolvedTarget
        }))
      ) {
        throw new Error(PATH_ACCESS_DENIED_MESSAGE)
      }
      return candidateTarget
    } catch (error) {
      if (!isENOENT(error)) {
        throw error
      }
      const parent = dirname(existingAncestor)
      if (parent === existingAncestor) {
        throw error
      }
      // Why: create/copy callers may create missing parents after auth. Track
      // them while canonicalizing the nearest existing ancestor.
      missingSegments.unshift(basename(existingAncestor))
      existingAncestor = parent
    }
  }
}

async function isPathAllowedIncludingRegisteredWorktrees(
  targetPath: string,
  store: Store,
  options: { canonicalSourcePath?: string } = {}
): Promise<boolean> {
  if (isPathAllowed(targetPath, store) || isRegisteredWorktreePath(targetPath)) {
    return true
  }
  if (await isPathAllowedByCanonicalAllowedRoot(targetPath, options.canonicalSourcePath, store)) {
    return true
  }
  if (await isPathAllowedByCanonicalRegisteredRoot(targetPath, options.canonicalSourcePath)) {
    return true
  }

  await ensureAuthorizedRootsCache(store)
  // Why: linked worktrees can live outside repo roots. The refreshed exact-root
  // index authorizes their descendants without running git per file access.
  return (
    isRegisteredWorktreePath(targetPath) ||
    (await isPathAllowedByCanonicalRegisteredRoot(targetPath, options.canonicalSourcePath))
  )
}

async function isPathAllowedByCanonicalAllowedRoot(
  targetPath: string,
  sourcePath: string | undefined,
  store: Store
): Promise<boolean> {
  if (!sourcePath) {
    return false
  }
  for (const root of getAllowedRoots(store)) {
    const resolvedRoot = resolve(root)
    if (!isDescendantOrEqual(sourcePath, resolvedRoot)) {
      continue
    }
    // Why: canonicalize only the actively matched root instead of probing the
    // whole repo set and triggering macOS privacy prompts.
    const canonicalRoot = await normalizeExistingPath(resolvedRoot)
    if (isDescendantOrEqual(targetPath, canonicalRoot)) {
      return true
    }
  }
  return false
}

export function validateGitRelativeFilePath(worktreePath: string, filePath: string): string {
  if (!filePath || filePath.includes('\0') || resolve(filePath) === filePath) {
    throw new Error('Access denied: invalid git file path')
  }

  const resolvedFilePath = resolve(worktreePath, filePath)
  if (!isDescendantOrEqual(resolvedFilePath, worktreePath)) {
    throw new Error('Access denied: git file path escapes the selected worktree')
  }

  const normalizedRelativePath = relative(worktreePath, resolvedFilePath)
  if (!normalizedRelativePath) {
    throw new Error('Access denied: invalid git file path')
  }
  return normalizedRelativePath
}
