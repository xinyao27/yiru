import { realpath } from 'node:fs/promises'

import { resolveAuthorizedPath } from '../filesystem/auth'
import type { Store } from '../persistence'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import { CoworkingExecutionError } from './execution-error'
import { readCoworkingGitAdministrativePaths } from './git-administrative-path-reader'
import type {
  CoworkingCanonicalHostPath,
  CoworkingHostPathRelationship,
  CoworkingHostPathResolution,
  CoworkingWorktreeContainmentHost
} from './worktree-containment'
import type { CoworkingOwnerWorktree } from './worktree-incarnation'
import {
  canonicalCoworkingHostPath,
  equalCoworkingCanonicalPath,
  isMissingCoworkingPath,
  joinCoworkingHostPath,
  localCoworkingHostScope,
  localCoworkingPathIdentity,
  lstatCoworkingHostPath,
  remoteCoworkingPathIdentity,
  requireCoworkingSshFilesystem,
  coworkingFilesystemProvider,
  coworkingHostPath,
  coworkingSshHostScope
} from './yiru-host-paths'
import { YiruCoworkingVerifiedFileOperations } from './yiru-verified-file-operations'

/** Implements containment and verified IO on the worktree's already-authorized host route. */
export class YiruCoworkingHostFiles
  extends YiruCoworkingVerifiedFileOperations
  implements CoworkingWorktreeContainmentHost
{
  constructor(private readonly store: Store) {
    super()
  }

  async resolveRoot(target: CoworkingOwnerWorktree): Promise<CoworkingCanonicalHostPath> {
    if (target.connectionId) {
      const provider = requireCoworkingSshFilesystem(target.connectionId)
      const platform = getSshGitProvider(target.connectionId)?.getHostPlatform()
      if (!platform) {
        throw new CoworkingExecutionError('resource_unavailable')
      }
      return canonicalCoworkingHostPath(
        coworkingSshHostScope(target.connectionId, platform.pathFlavor),
        await provider.realpath(target.worktreePath),
        await remoteCoworkingPathIdentity(provider, target.worktreePath)
      )
    }
    const authorized = await resolveAuthorizedPath(target.worktreePath, this.store)
    const absolutePath = await realpath(authorized)
    return canonicalCoworkingHostPath(
      localCoworkingHostScope(),
      absolutePath,
      await localCoworkingPathIdentity(absolutePath)
    )
  }

  async resolveExisting(
    root: CoworkingCanonicalHostPath,
    segments: readonly string[]
  ): Promise<CoworkingHostPathResolution | null> {
    const candidate = joinCoworkingHostPath(root, segments)
    await this.requireNoSymlinkTraversal(root, candidate)
    const target = await this.canonicalExisting(root, candidate)
    const parent =
      segments.length === 0
        ? target
        : await this.canonicalExisting(root, coworkingHostPath(root).dirname(candidate))
    return { target, parent, exists: true }
  }

  async resolveForCreate(
    root: CoworkingCanonicalHostPath,
    segments: readonly string[]
  ): Promise<CoworkingHostPathResolution | null> {
    const candidate = joinCoworkingHostPath(root, segments)
    const parentPath = coworkingHostPath(root).dirname(candidate)
    await this.requireNoSymlinkTraversal(root, parentPath)
    const parent = await this.canonicalExisting(root, parentPath)
    const existing = await this.tryCanonicalExisting(root, candidate)
    // Why: creation must use the canonical parent spelling that the relay proof binds.
    return {
      target:
        existing ??
        canonicalCoworkingHostPath(
          root.scopeKey,
          coworkingHostPath(root).join(
            parent.absolutePath,
            coworkingHostPath(root).basename(candidate)
          ),
          null
        ),
      parent,
      exists: existing !== null
    }
  }

  async resolveCanonicalAlias(
    root: CoworkingCanonicalHostPath,
    segments: readonly string[],
    signal: AbortSignal
  ): Promise<CoworkingCanonicalHostPath | null> {
    // Why: listing filters need only the symlink target path; probing identity adds remote RPCs
    // and would pair the target path with the symlink's own lstat identity.
    signal.throwIfAborted()
    const result = await this.tryCanonicalPath(root, joinCoworkingHostPath(root, segments))
    signal.throwIfAborted()
    return result
  }

  async resolveGitAdministrativePaths(
    root: CoworkingCanonicalHostPath
  ): Promise<readonly CoworkingCanonicalHostPath[]> {
    const dotGit = joinCoworkingHostPath(root, ['.git'])
    const resolved = await this.tryCanonicalExisting(root, dotGit)
    if (!resolved) {
      // Why: unknown Git administration means containment cannot prove metadata is hidden.
      return []
    }
    const gitPaths = await readCoworkingGitAdministrativePaths(root)
    const administrativePaths = await Promise.all(
      gitPaths.map(async (gitPath) => await this.canonicalGitAdministrativePath(root, gitPath))
    )
    // Why: canonical targets block content access, while lexical Git output
    // also hides an in-tree symlink or junction that spells the same admin root.
    const lexicalPaths = gitPaths.map((gitPath) =>
      canonicalCoworkingHostPath(root.scopeKey, gitPath, null)
    )
    return deduplicateAdministrativePaths([resolved, ...lexicalPaths, ...administrativePaths])
  }

  joinPath(root: CoworkingCanonicalHostPath, segments: readonly string[]): string {
    return joinCoworkingHostPath(root, segments)
  }

  relationship(
    root: CoworkingCanonicalHostPath,
    candidate: CoworkingCanonicalHostPath
  ): CoworkingHostPathRelationship {
    if (root.scopeKey !== candidate.scopeKey) {
      return 'incomparable'
    }
    const relative = coworkingHostPath(root).relative(root.absolutePath, candidate.absolutePath)
    if (relative === '') {
      return 'same'
    }
    return relative === '..' ||
      relative.startsWith(`..${coworkingHostPath(root).sep}`) ||
      coworkingHostPath(root).isAbsolute(relative)
      ? 'outside'
      : 'descendant'
  }

  async revalidate(
    root: CoworkingCanonicalHostPath,
    resolution: CoworkingHostPathResolution
  ): Promise<boolean> {
    const target = await this.tryCanonicalExisting(root, resolution.target.absolutePath)
    if (!resolution.exists) {
      return target === null && (await sameIdentity(root, resolution.parent, this))
    }
    return target !== null && equalCoworkingCanonicalPath(target, resolution.target)
  }

  private async canonicalExisting(
    root: CoworkingCanonicalHostPath,
    absolutePath: string
  ): Promise<CoworkingCanonicalHostPath> {
    const provider = coworkingFilesystemProvider(root)
    if (provider) {
      return canonicalCoworkingHostPath(
        root.scopeKey,
        await provider.realpath(absolutePath),
        await remoteCoworkingPathIdentity(provider, absolutePath)
      )
    }
    const authorized = await resolveAuthorizedPath(absolutePath, this.store)
    const canonical = await realpath(authorized)
    return canonicalCoworkingHostPath(
      root.scopeKey,
      canonical,
      await localCoworkingPathIdentity(canonical)
    )
  }

  private async tryCanonicalExisting(
    root: CoworkingCanonicalHostPath,
    absolutePath: string
  ): Promise<CoworkingCanonicalHostPath | null> {
    try {
      return await this.canonicalExisting(root, absolutePath)
    } catch (error) {
      if (isMissingCoworkingPath(error)) {
        return null
      }
      throw error
    }
  }

  private async tryCanonicalPath(
    root: CoworkingCanonicalHostPath,
    absolutePath: string
  ): Promise<CoworkingCanonicalHostPath | null> {
    try {
      const provider = coworkingFilesystemProvider(root)
      const canonical = provider
        ? await provider.realpath(absolutePath)
        : await realpath(await resolveAuthorizedPath(absolutePath, this.store))
      return canonicalCoworkingHostPath(root.scopeKey, canonical, null)
    } catch (error) {
      if (isMissingCoworkingPath(error)) {
        return null
      }
      throw error
    }
  }

  private async canonicalGitAdministrativePath(
    root: CoworkingCanonicalHostPath,
    absolutePath: string
  ): Promise<CoworkingCanonicalHostPath> {
    const provider = coworkingFilesystemProvider(root)
    if (provider) {
      const canonical = await provider.realpath(absolutePath)
      return canonicalCoworkingHostPath(
        root.scopeKey,
        canonical,
        await remoteCoworkingPathIdentity(provider, canonical)
      )
    }
    const canonical = await realpath(absolutePath)
    return canonicalCoworkingHostPath(
      root.scopeKey,
      canonical,
      await localCoworkingPathIdentity(canonical)
    )
  }

  private async requireNoSymlinkTraversal(
    root: CoworkingCanonicalHostPath,
    absolutePath: string
  ): Promise<void> {
    const relative = coworkingHostPath(root).relative(root.absolutePath, absolutePath)
    const parts = relative ? relative.split(coworkingHostPath(root).sep) : []
    let cursor = root.absolutePath
    for (const part of parts) {
      cursor = coworkingHostPath(root).join(cursor, part)
      const stats = await lstatCoworkingHostPath(root, cursor)
      if (stats.type === 'symlink') {
        // Why: relays lack verified-handle traversal, so ambiguous symlink paths fail closed.
        throw new CoworkingExecutionError('resource_not_found')
      }
    }
  }
}

function deduplicateAdministrativePaths(
  paths: readonly CoworkingCanonicalHostPath[]
): CoworkingCanonicalHostPath[] {
  const unique: CoworkingCanonicalHostPath[] = []
  for (const candidate of paths) {
    if (
      !unique.some(
        (existing) =>
          existing.scopeKey === candidate.scopeKey &&
          existing.absolutePath === candidate.absolutePath
      )
    ) {
      unique.push(candidate)
    }
  }
  return unique
}

async function sameIdentity(
  root: CoworkingCanonicalHostPath,
  expected: CoworkingCanonicalHostPath,
  host: YiruCoworkingHostFiles
): Promise<boolean> {
  const current = await host.resolveExisting(
    root,
    coworkingHostPath(root)
      .relative(root.absolutePath, expected.absolutePath)
      .split(coworkingHostPath(root).sep)
      .filter(Boolean)
  )
  return current !== null && equalCoworkingCanonicalPath(current.target, expected)
}
