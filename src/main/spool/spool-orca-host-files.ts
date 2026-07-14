import { realpath } from 'node:fs/promises'
import type { Store } from '../persistence'
import { resolveAuthorizedPath } from '../ipc/filesystem-auth'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import { SpoolExecutionError } from './spool-execution-error'
import {
  canonicalSpoolHostPath,
  equalSpoolCanonicalPath,
  isMissingSpoolPath,
  joinSpoolHostPath,
  localSpoolHostScope,
  localSpoolPathIdentity,
  lstatSpoolHostPath,
  remoteSpoolPathIdentity,
  requireSpoolSshFilesystem,
  spoolFilesystemProvider,
  spoolHostPath,
  spoolSshHostScope
} from './spool-orca-host-paths'
import { OrcaSpoolVerifiedFileOperations } from './spool-orca-verified-file-operations'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import type {
  SpoolCanonicalHostPath,
  SpoolHostPathRelationship,
  SpoolHostPathResolution,
  SpoolWorktreeContainmentHost
} from './spool-worktree-containment'

/** Implements containment and verified IO on the worktree's already-authorized host route. */
export class OrcaSpoolHostFiles
  extends OrcaSpoolVerifiedFileOperations
  implements SpoolWorktreeContainmentHost
{
  constructor(private readonly store: Store) {
    super()
  }

  async resolveRoot(target: SpoolOwnerWorktree): Promise<SpoolCanonicalHostPath> {
    if (target.connectionId) {
      const provider = requireSpoolSshFilesystem(target.connectionId)
      const platform = getSshGitProvider(target.connectionId)?.getHostPlatform()
      if (!platform) {
        throw new SpoolExecutionError('resource_unavailable')
      }
      return canonicalSpoolHostPath(
        spoolSshHostScope(target.connectionId, platform.pathFlavor),
        await provider.realpath(target.worktreePath),
        await remoteSpoolPathIdentity(provider, target.worktreePath)
      )
    }
    const authorized = await resolveAuthorizedPath(target.worktreePath, this.store)
    const absolutePath = await realpath(authorized)
    return canonicalSpoolHostPath(
      localSpoolHostScope(),
      absolutePath,
      await localSpoolPathIdentity(absolutePath)
    )
  }

  async resolveExisting(
    root: SpoolCanonicalHostPath,
    segments: readonly string[]
  ): Promise<SpoolHostPathResolution | null> {
    const candidate = joinSpoolHostPath(root, segments)
    await this.requireNoSymlinkTraversal(root, candidate)
    const target = await this.canonicalExisting(root, candidate)
    const parent =
      segments.length === 0
        ? target
        : await this.canonicalExisting(root, spoolHostPath(root).dirname(candidate))
    return { target, parent, exists: true }
  }

  async resolveForCreate(
    root: SpoolCanonicalHostPath,
    segments: readonly string[]
  ): Promise<SpoolHostPathResolution | null> {
    const candidate = joinSpoolHostPath(root, segments)
    const parentPath = spoolHostPath(root).dirname(candidate)
    await this.requireNoSymlinkTraversal(root, parentPath)
    const parent = await this.canonicalExisting(root, parentPath)
    const existing = await this.tryCanonicalExisting(root, candidate)
    // Why: creation must use the canonical parent spelling that the relay proof binds.
    return {
      target:
        existing ??
        canonicalSpoolHostPath(
          root.scopeKey,
          spoolHostPath(root).join(parent.absolutePath, spoolHostPath(root).basename(candidate)),
          null
        ),
      parent,
      exists: existing !== null
    }
  }

  async resolveGitAdministrativePaths(
    root: SpoolCanonicalHostPath
  ): Promise<readonly SpoolCanonicalHostPath[]> {
    const dotGit = joinSpoolHostPath(root, ['.git'])
    const resolved = await this.tryCanonicalExisting(root, dotGit)
    // Why: unknown Git administration means containment cannot prove metadata is hidden.
    return resolved ? [resolved] : []
  }

  relationship(
    root: SpoolCanonicalHostPath,
    candidate: SpoolCanonicalHostPath
  ): SpoolHostPathRelationship {
    if (root.scopeKey !== candidate.scopeKey) {
      return 'incomparable'
    }
    const relative = spoolHostPath(root).relative(root.absolutePath, candidate.absolutePath)
    if (relative === '') {
      return 'same'
    }
    return relative === '..' ||
      relative.startsWith(`..${spoolHostPath(root).sep}`) ||
      spoolHostPath(root).isAbsolute(relative)
      ? 'outside'
      : 'descendant'
  }

  async revalidate(
    root: SpoolCanonicalHostPath,
    resolution: SpoolHostPathResolution
  ): Promise<boolean> {
    const target = await this.tryCanonicalExisting(root, resolution.target.absolutePath)
    if (!resolution.exists) {
      return target === null && (await sameIdentity(root, resolution.parent, this))
    }
    return target !== null && equalSpoolCanonicalPath(target, resolution.target)
  }

  private async canonicalExisting(
    root: SpoolCanonicalHostPath,
    absolutePath: string
  ): Promise<SpoolCanonicalHostPath> {
    const provider = spoolFilesystemProvider(root)
    if (provider) {
      return canonicalSpoolHostPath(
        root.scopeKey,
        await provider.realpath(absolutePath),
        await remoteSpoolPathIdentity(provider, absolutePath)
      )
    }
    const authorized = await resolveAuthorizedPath(absolutePath, this.store)
    const canonical = await realpath(authorized)
    return canonicalSpoolHostPath(root.scopeKey, canonical, await localSpoolPathIdentity(canonical))
  }

  private async tryCanonicalExisting(
    root: SpoolCanonicalHostPath,
    absolutePath: string
  ): Promise<SpoolCanonicalHostPath | null> {
    try {
      return await this.canonicalExisting(root, absolutePath)
    } catch (error) {
      if (isMissingSpoolPath(error)) {
        return null
      }
      throw error
    }
  }

  private async requireNoSymlinkTraversal(
    root: SpoolCanonicalHostPath,
    absolutePath: string
  ): Promise<void> {
    const relative = spoolHostPath(root).relative(root.absolutePath, absolutePath)
    const parts = relative ? relative.split(spoolHostPath(root).sep) : []
    let cursor = root.absolutePath
    for (const part of parts) {
      cursor = spoolHostPath(root).join(cursor, part)
      const stats = await lstatSpoolHostPath(root, cursor)
      if (stats.type === 'symlink') {
        // Why: relays lack verified-handle traversal, so ambiguous symlink paths fail closed.
        throw new SpoolExecutionError('resource_not_found')
      }
    }
  }
}

async function sameIdentity(
  root: SpoolCanonicalHostPath,
  expected: SpoolCanonicalHostPath,
  host: OrcaSpoolHostFiles
): Promise<boolean> {
  const current = await host.resolveExisting(
    root,
    spoolHostPath(root)
      .relative(root.absolutePath, expected.absolutePath)
      .split(spoolHostPath(root).sep)
      .filter(Boolean)
  )
  return current !== null && equalSpoolCanonicalPath(current.target, expected)
}
