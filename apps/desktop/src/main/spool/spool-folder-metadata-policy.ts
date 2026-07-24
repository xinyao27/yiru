import { isWindowsAbsolutePathLike, relativePathInsideRoot } from '@yiru/workbench-model/platform'
import { parseWslUncPath } from '@yiru/workbench-model/platform'

import { SpoolExecutionError } from './spool-execution-error'
import {
  SPOOL_FOLDER_INCARNATION_MARKER_FILENAME,
  SPOOL_FOLDER_INCARNATION_TEMP_PREFIX
} from './spool-incarnation-marker-store'
import type {
  SpoolCanonicalHostPath,
  SpoolWorktreeContainmentHost
} from './spool-worktree-containment'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'

type FolderMetadataHost = Pick<SpoolWorktreeContainmentHost, 'joinPath' | 'resolveCanonicalAlias'>

export function spoolFolderPathContainsGitSegment(pathValue: string): boolean {
  const windowsPath = isWindowsAbsolutePathLike(pathValue) && !parseWslUncPath(pathValue)
  return pathValue.split(/[\\/]/).some((segment) => {
    const comparable = windowsPath ? segment.replace(/[ .]+$/u, '') : segment
    return comparable.toLowerCase() === '.git'
  })
}

export function requireVisibleSpoolFolderPath(
  target: SpoolOwnerWorktree,
  root: SpoolCanonicalHostPath,
  segments: readonly string[]
): void {
  if (
    target.kind === 'folder' &&
    segments[0] &&
    isFolderIncarnationMetadataName(segments[0], root.absolutePath)
  ) {
    throw new SpoolExecutionError('resource_not_found')
  }
}

export function isSpoolFolderIncarnationMetadataPath(
  root: SpoolCanonicalHostPath,
  candidate: SpoolCanonicalHostPath
): boolean {
  const relativePath = relativePathInsideRoot(root.absolutePath, candidate.absolutePath)
  const firstSegment = relativePath?.split('/')[0]
  return Boolean(firstSegment && isFolderIncarnationMetadataName(firstSegment, root.absolutePath))
}

export function isSpoolFolderHiddenMetadataChild(args: {
  host: FolderMetadataHost
  root: SpoolCanonicalHostPath
  parentSegments: readonly string[]
  name: string
  kind: 'file' | 'directory' | 'symlink'
  signal: AbortSignal
}): boolean | Promise<boolean> {
  if (
    spoolFolderPathContainsGitSegment(
      args.host.joinPath(args.root, [...args.parentSegments, args.name])
    ) ||
    (args.parentSegments.length === 0 &&
      isFolderIncarnationMetadataName(args.name, args.root.absolutePath))
  ) {
    return true
  }
  return args.kind === 'symlink' ? isResolvedFolderMetadataAlias(args) : false
}

async function isResolvedFolderMetadataAlias(args: {
  host: FolderMetadataHost
  root: SpoolCanonicalHostPath
  parentSegments: readonly string[]
  name: string
  signal: AbortSignal
}): Promise<boolean> {
  try {
    args.signal.throwIfAborted()
    const canonicalTarget = await args.host.resolveCanonicalAlias(
      args.root,
      [...args.parentSegments, args.name],
      args.signal
    )
    args.signal.throwIfAborted()
    if (!canonicalTarget?.scopeKey.trim() || !canonicalTarget.absolutePath.trim()) {
      return true
    }
    return (
      spoolFolderPathContainsGitSegment(canonicalTarget.absolutePath) ||
      isSpoolFolderIncarnationMetadataPath(args.root, canonicalTarget)
    )
  } catch {
    if (args.signal.aborted) {
      args.signal.throwIfAborted()
    }
    // Why: an unresolved symlink cannot be proven distinct from hidden owner metadata.
    return true
  }
}

function isFolderIncarnationMetadataName(name: string, rootPath: string): boolean {
  const windowsPath = isWindowsAbsolutePathLike(rootPath) && !parseWslUncPath(rootPath)
  const comparable = windowsPath ? name.replace(/[ .]+$/u, '').toLowerCase() : name
  const marker = windowsPath
    ? SPOOL_FOLDER_INCARNATION_MARKER_FILENAME.toLowerCase()
    : SPOOL_FOLDER_INCARNATION_MARKER_FILENAME
  const temporaryPrefix = windowsPath
    ? SPOOL_FOLDER_INCARNATION_TEMP_PREFIX.toLowerCase()
    : SPOOL_FOLDER_INCARNATION_TEMP_PREFIX
  return comparable === marker || comparable.startsWith(temporaryPrefix)
}
