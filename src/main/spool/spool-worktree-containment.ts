import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import { SpoolExecutionError } from './spool-execution-error'
import { SPOOL_FOLDER_INCARNATION_MARKER_FILENAME } from './spool-incarnation-marker-store'
import {
  isSpoolFolderHiddenMetadataChild,
  isSpoolFolderIncarnationMetadataPath,
  requireVisibleSpoolFolderPath,
  spoolFolderPathContainsGitSegment
} from './spool-folder-metadata-policy'

const MAX_RELATIVE_PATH_BYTES = 4_096

export type SpoolCanonicalHostPath = {
  scopeKey: string
  absolutePath: string
  identity: string | null
}

export type SpoolHostPathResolution = {
  target: SpoolCanonicalHostPath
  parent: SpoolCanonicalHostPath
  exists: boolean
}

export type SpoolHostPathRelationship = 'same' | 'descendant' | 'outside' | 'incomparable'

export type SpoolContainedPath = {
  relativePath: string
  segments: readonly string[]
  root: SpoolCanonicalHostPath
  target: SpoolCanonicalHostPath
  parent: SpoolCanonicalHostPath
  exists: boolean
  isHiddenMetadataChild(
    name: string,
    kind: 'file' | 'directory' | 'symlink',
    signal: AbortSignal
  ): boolean | Promise<boolean>
  revalidate(): Promise<boolean>
}

export type SpoolWorktreeContainmentHost = {
  resolveRoot(target: SpoolOwnerWorktree): Promise<SpoolCanonicalHostPath>
  resolveExisting(
    root: SpoolCanonicalHostPath,
    segments: readonly string[]
  ): Promise<SpoolHostPathResolution | null>
  resolveForCreate(
    root: SpoolCanonicalHostPath,
    segments: readonly string[]
  ): Promise<SpoolHostPathResolution | null>
  resolveCanonicalAlias(
    root: SpoolCanonicalHostPath,
    segments: readonly string[],
    signal: AbortSignal
  ): Promise<SpoolCanonicalHostPath | null>
  resolveGitAdministrativePaths(
    root: SpoolCanonicalHostPath
  ): Promise<readonly SpoolCanonicalHostPath[]>
  joinPath(root: SpoolCanonicalHostPath, segments: readonly string[]): string
  relationship(
    root: SpoolCanonicalHostPath,
    candidate: SpoolCanonicalHostPath
  ): SpoolHostPathRelationship
  revalidate(root: SpoolCanonicalHostPath, resolution: SpoolHostPathResolution): Promise<boolean>
}

/** Owns path policy while delegating actual path semantics to the execution host. */
export class SpoolWorktreeContainment {
  constructor(private readonly host: SpoolWorktreeContainmentHost) {}

  async bindExisting(
    target: SpoolOwnerWorktree,
    relativePath: string,
    options: { allowRoot?: boolean } = {}
  ): Promise<SpoolContainedPath> {
    const parsed = parseRelativePath(relativePath, options.allowRoot === true)
    const root = await this.resolveRoot(target)
    requireVisibleSpoolFolderPath(target, root, parsed.segments)
    const resolution = await this.host.resolveExisting(root, parsed.segments)
    if (!resolution?.exists) {
      throw new SpoolExecutionError('resource_not_found')
    }
    const administrativePaths = await this.requireContained(target, root, resolution)
    return this.toContainedPath(
      target,
      parsed.normalized,
      parsed.segments,
      root,
      resolution,
      administrativePaths
    )
  }

  async bindForCreate(
    target: SpoolOwnerWorktree,
    relativePath: string
  ): Promise<SpoolContainedPath> {
    const parsed = parseRelativePath(relativePath, false)
    const root = await this.resolveRoot(target)
    requireVisibleSpoolFolderPath(target, root, parsed.segments)
    const resolution = await this.host.resolveForCreate(root, parsed.segments)
    if (!resolution) {
      throw new SpoolExecutionError('resource_not_found')
    }
    const administrativePaths = await this.requireContained(target, root, resolution)
    return this.toContainedPath(
      target,
      parsed.normalized,
      parsed.segments,
      root,
      resolution,
      administrativePaths
    )
  }

  private async resolveRoot(target: SpoolOwnerWorktree): Promise<SpoolCanonicalHostPath> {
    let root: SpoolCanonicalHostPath
    try {
      root = await this.host.resolveRoot(target)
    } catch {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (!isValidCanonicalPath(root)) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (target.kind === 'folder' && spoolFolderPathContainsGitSegment(root.absolutePath)) {
      throw new SpoolExecutionError('resource_not_found')
    }
    return root
  }

  private async requireContained(
    target: SpoolOwnerWorktree,
    root: SpoolCanonicalHostPath,
    resolution: SpoolHostPathResolution
  ): Promise<readonly SpoolCanonicalHostPath[]> {
    if (!isValidResolution(resolution)) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (
      !root.identity ||
      !resolution.parent.identity ||
      (resolution.exists && !resolution.target.identity)
    ) {
      // Why: a backend without stable identities cannot prove a symlink did not retarget.
      throw new SpoolExecutionError('resource_unavailable')
    }
    requireInside(this.host.relationship(root, resolution.parent))
    requireInside(this.host.relationship(root, resolution.target))
    if (target.kind === 'folder') {
      if (
        spoolFolderPathContainsGitSegment(resolution.parent.absolutePath) ||
        spoolFolderPathContainsGitSegment(resolution.target.absolutePath) ||
        isSpoolFolderIncarnationMetadataPath(root, resolution.target) ||
        isSameOrDescendant(
          this.host.relationship(
            {
              scopeKey: root.scopeKey,
              absolutePath: this.host.joinPath(root, [SPOOL_FOLDER_INCARNATION_MARKER_FILENAME]),
              identity: null
            },
            resolution.target
          )
        )
      ) {
        // Why: canonical checks also catch aliases and symlinks to owner-only metadata.
        throw new SpoolExecutionError('resource_not_found')
      }
      // Why: folder workspaces have no trusted repository boundary beyond .git denial.
      return []
    }
    let administrativePaths: readonly SpoolCanonicalHostPath[]
    try {
      administrativePaths = await this.host.resolveGitAdministrativePaths(root)
    } catch {
      // Why: an unknown Git admin root can turn an innocent-looking symlink into metadata access.
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (administrativePaths.length === 0) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    for (const administrativePath of administrativePaths) {
      if (!isValidCanonicalPath(administrativePath)) {
        throw new SpoolExecutionError('resource_unavailable')
      }
      if (isSameOrDescendant(this.host.relationship(administrativePath, resolution.target))) {
        throw new SpoolExecutionError('resource_not_found')
      }
    }
    return administrativePaths
  }

  private toContainedPath(
    target: SpoolOwnerWorktree,
    relativePath: string,
    segments: readonly string[],
    root: SpoolCanonicalHostPath,
    resolution: SpoolHostPathResolution,
    administrativePaths: readonly SpoolCanonicalHostPath[]
  ): SpoolContainedPath {
    return {
      relativePath,
      segments: [...segments],
      root: { ...root },
      target: { ...resolution.target },
      parent: { ...resolution.parent },
      exists: resolution.exists,
      isHiddenMetadataChild: (name, kind, signal) =>
        target.kind === 'folder'
          ? isSpoolFolderHiddenMetadataChild({
              host: this.host,
              root,
              parentSegments: segments,
              name,
              kind,
              signal
            })
          : this.isGitAdministrativeChild(root, segments, name, administrativePaths),
      revalidate: async () => {
        try {
          return await this.host.revalidate(root, resolution)
        } catch {
          return false
        }
      }
    }
  }

  private isGitAdministrativeChild(
    root: SpoolCanonicalHostPath,
    parentSegments: readonly string[],
    name: string,
    administrativePaths: readonly SpoolCanonicalHostPath[]
  ): boolean {
    const candidate: SpoolCanonicalHostPath = {
      scopeKey: root.scopeKey,
      absolutePath: this.host.joinPath(root, [...parentSegments, name]),
      identity: null
    }
    return administrativePaths.some((administrativePath) =>
      isSameOrDescendant(this.host.relationship(administrativePath, candidate))
    )
  }
}

export function normalizeSpoolRelativePath(relativePath: string, allowRoot = false): string {
  return parseRelativePath(relativePath, allowRoot).normalized
}

function parseRelativePath(
  relativePath: string,
  allowRoot: boolean
): { normalized: string; segments: readonly string[] } {
  if (
    typeof relativePath !== 'string' ||
    relativePath.includes('\0') ||
    relativePath.includes('\\') ||
    relativePath.includes(':') ||
    relativePath.startsWith('/') ||
    Buffer.byteLength(relativePath, 'utf8') > MAX_RELATIVE_PATH_BYTES
  ) {
    throw new SpoolExecutionError('invalid_argument')
  }
  if (relativePath === '') {
    if (allowRoot) {
      return { normalized: '', segments: [] }
    }
    throw new SpoolExecutionError('invalid_argument')
  }
  const segments = relativePath.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new SpoolExecutionError('invalid_argument')
  }
  if (segments.some((segment) => segment.toLowerCase() === '.git')) {
    throw new SpoolExecutionError('resource_not_found')
  }
  return { normalized: segments.join('/'), segments }
}

function requireInside(relationship: SpoolHostPathRelationship): void {
  if (!isSameOrDescendant(relationship)) {
    throw new SpoolExecutionError('resource_not_found')
  }
}

function isSameOrDescendant(relationship: SpoolHostPathRelationship): boolean {
  return relationship === 'same' || relationship === 'descendant'
}

function isValidCanonicalPath(path: SpoolCanonicalHostPath): boolean {
  return Boolean(path.scopeKey?.trim() && path.absolutePath?.trim())
}

function isValidResolution(resolution: SpoolHostPathResolution): boolean {
  return isValidCanonicalPath(resolution.target) && isValidCanonicalPath(resolution.parent)
}
