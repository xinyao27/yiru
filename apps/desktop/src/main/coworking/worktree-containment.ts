import { CoworkingExecutionError } from './execution-error'
import {
  isCoworkingFolderHiddenMetadataChild,
  isCoworkingFolderIncarnationMetadataPath,
  requireVisibleCoworkingFolderPath,
  coworkingFolderPathContainsGitSegment
} from './folder-metadata-policy'
import { COWORKING_FOLDER_INCARNATION_MARKER_FILENAME } from './incarnation-marker-store'
import type { CoworkingOwnerWorktree } from './worktree-incarnation'

const MAX_RELATIVE_PATH_BYTES = 4_096

export type CoworkingCanonicalHostPath = {
  scopeKey: string
  absolutePath: string
  identity: string | null
}

export type CoworkingHostPathResolution = {
  target: CoworkingCanonicalHostPath
  parent: CoworkingCanonicalHostPath
  exists: boolean
}

export type CoworkingHostPathRelationship = 'same' | 'descendant' | 'outside' | 'incomparable'

export type CoworkingContainedPath = {
  relativePath: string
  segments: readonly string[]
  root: CoworkingCanonicalHostPath
  target: CoworkingCanonicalHostPath
  parent: CoworkingCanonicalHostPath
  exists: boolean
  isHiddenMetadataChild(
    name: string,
    kind: 'file' | 'directory' | 'symlink',
    signal: AbortSignal
  ): boolean | Promise<boolean>
  revalidate(): Promise<boolean>
}

export type CoworkingWorktreeContainmentHost = {
  resolveRoot(target: CoworkingOwnerWorktree): Promise<CoworkingCanonicalHostPath>
  resolveExisting(
    root: CoworkingCanonicalHostPath,
    segments: readonly string[]
  ): Promise<CoworkingHostPathResolution | null>
  resolveForCreate(
    root: CoworkingCanonicalHostPath,
    segments: readonly string[]
  ): Promise<CoworkingHostPathResolution | null>
  resolveCanonicalAlias(
    root: CoworkingCanonicalHostPath,
    segments: readonly string[],
    signal: AbortSignal
  ): Promise<CoworkingCanonicalHostPath | null>
  resolveGitAdministrativePaths(
    root: CoworkingCanonicalHostPath
  ): Promise<readonly CoworkingCanonicalHostPath[]>
  joinPath(root: CoworkingCanonicalHostPath, segments: readonly string[]): string
  relationship(
    root: CoworkingCanonicalHostPath,
    candidate: CoworkingCanonicalHostPath
  ): CoworkingHostPathRelationship
  revalidate(
    root: CoworkingCanonicalHostPath,
    resolution: CoworkingHostPathResolution
  ): Promise<boolean>
}

/** Owns path policy while delegating actual path semantics to the execution host. */
export class CoworkingWorktreeContainment {
  constructor(private readonly host: CoworkingWorktreeContainmentHost) {}

  async bindExisting(
    target: CoworkingOwnerWorktree,
    relativePath: string,
    options: { allowRoot?: boolean } = {}
  ): Promise<CoworkingContainedPath> {
    const parsed = parseRelativePath(relativePath, options.allowRoot === true)
    const root = await this.resolveRoot(target)
    requireVisibleCoworkingFolderPath(target, root, parsed.segments)
    const resolution = await this.host.resolveExisting(root, parsed.segments)
    if (!resolution?.exists) {
      throw new CoworkingExecutionError('resource_not_found')
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
    target: CoworkingOwnerWorktree,
    relativePath: string
  ): Promise<CoworkingContainedPath> {
    const parsed = parseRelativePath(relativePath, false)
    const root = await this.resolveRoot(target)
    requireVisibleCoworkingFolderPath(target, root, parsed.segments)
    const resolution = await this.host.resolveForCreate(root, parsed.segments)
    if (!resolution) {
      throw new CoworkingExecutionError('resource_not_found')
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

  private async resolveRoot(target: CoworkingOwnerWorktree): Promise<CoworkingCanonicalHostPath> {
    let root: CoworkingCanonicalHostPath
    try {
      root = await this.host.resolveRoot(target)
    } catch {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    if (!isValidCanonicalPath(root)) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    if (target.kind === 'folder' && coworkingFolderPathContainsGitSegment(root.absolutePath)) {
      throw new CoworkingExecutionError('resource_not_found')
    }
    return root
  }

  private async requireContained(
    target: CoworkingOwnerWorktree,
    root: CoworkingCanonicalHostPath,
    resolution: CoworkingHostPathResolution
  ): Promise<readonly CoworkingCanonicalHostPath[]> {
    if (!isValidResolution(resolution)) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    if (
      !root.identity ||
      !resolution.parent.identity ||
      (resolution.exists && !resolution.target.identity)
    ) {
      // Why: a backend without stable identities cannot prove a symlink did not retarget.
      throw new CoworkingExecutionError('resource_unavailable')
    }
    requireInside(this.host.relationship(root, resolution.parent))
    requireInside(this.host.relationship(root, resolution.target))
    if (target.kind === 'folder') {
      if (
        coworkingFolderPathContainsGitSegment(resolution.parent.absolutePath) ||
        coworkingFolderPathContainsGitSegment(resolution.target.absolutePath) ||
        isCoworkingFolderIncarnationMetadataPath(root, resolution.target) ||
        isSameOrDescendant(
          this.host.relationship(
            {
              scopeKey: root.scopeKey,
              absolutePath: this.host.joinPath(root, [
                COWORKING_FOLDER_INCARNATION_MARKER_FILENAME
              ]),
              identity: null
            },
            resolution.target
          )
        )
      ) {
        // Why: canonical checks also catch aliases and symlinks to owner-only metadata.
        throw new CoworkingExecutionError('resource_not_found')
      }
      // Why: folder workspaces have no trusted repository boundary beyond .git denial.
      return []
    }
    let administrativePaths: readonly CoworkingCanonicalHostPath[]
    try {
      administrativePaths = await this.host.resolveGitAdministrativePaths(root)
    } catch {
      // Why: an unknown Git admin root can turn an innocent-looking symlink into metadata access.
      throw new CoworkingExecutionError('resource_unavailable')
    }
    if (administrativePaths.length === 0) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    for (const administrativePath of administrativePaths) {
      if (!isValidCanonicalPath(administrativePath)) {
        throw new CoworkingExecutionError('resource_unavailable')
      }
      if (isSameOrDescendant(this.host.relationship(administrativePath, resolution.target))) {
        throw new CoworkingExecutionError('resource_not_found')
      }
    }
    return administrativePaths
  }

  private toContainedPath(
    target: CoworkingOwnerWorktree,
    relativePath: string,
    segments: readonly string[],
    root: CoworkingCanonicalHostPath,
    resolution: CoworkingHostPathResolution,
    administrativePaths: readonly CoworkingCanonicalHostPath[]
  ): CoworkingContainedPath {
    return {
      relativePath,
      segments: [...segments],
      root: { ...root },
      target: { ...resolution.target },
      parent: { ...resolution.parent },
      exists: resolution.exists,
      isHiddenMetadataChild: (name, kind, signal) =>
        target.kind === 'folder'
          ? isCoworkingFolderHiddenMetadataChild({
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
    root: CoworkingCanonicalHostPath,
    parentSegments: readonly string[],
    name: string,
    administrativePaths: readonly CoworkingCanonicalHostPath[]
  ): boolean {
    const candidate: CoworkingCanonicalHostPath = {
      scopeKey: root.scopeKey,
      absolutePath: this.host.joinPath(root, [...parentSegments, name]),
      identity: null
    }
    return administrativePaths.some((administrativePath) =>
      isSameOrDescendant(this.host.relationship(administrativePath, candidate))
    )
  }
}

export function normalizeCoworkingRelativePath(relativePath: string, allowRoot = false): string {
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
    throw new CoworkingExecutionError('invalid_argument')
  }
  if (relativePath === '') {
    if (allowRoot) {
      return { normalized: '', segments: [] }
    }
    throw new CoworkingExecutionError('invalid_argument')
  }
  const segments = relativePath.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new CoworkingExecutionError('invalid_argument')
  }
  if (segments.some((segment) => segment.toLowerCase() === '.git')) {
    throw new CoworkingExecutionError('resource_not_found')
  }
  return { normalized: segments.join('/'), segments }
}

function requireInside(relationship: CoworkingHostPathRelationship): void {
  if (!isSameOrDescendant(relationship)) {
    throw new CoworkingExecutionError('resource_not_found')
  }
}

function isSameOrDescendant(relationship: CoworkingHostPathRelationship): boolean {
  return relationship === 'same' || relationship === 'descendant'
}

function isValidCanonicalPath(path: CoworkingCanonicalHostPath): boolean {
  return Boolean(path.scopeKey?.trim() && path.absolutePath?.trim())
}

function isValidResolution(resolution: CoworkingHostPathResolution): boolean {
  return isValidCanonicalPath(resolution.target) && isValidCanonicalPath(resolution.parent)
}
