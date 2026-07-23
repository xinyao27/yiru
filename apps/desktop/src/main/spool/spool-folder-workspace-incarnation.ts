import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'

import { normalizeRuntimePathForComparison } from '@yiru/workbench-model/platform'
import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { SpoolActualHostPathResolver } from './spool-actual-host-path-resolver'
import {
  isDefinitiveSpoolFilesystemFailure,
  isMissingSpoolFilesystemError
} from './spool-canonical-host-path'
import {
  SPOOL_FOLDER_INCARNATION_MARKER_FILENAME,
  SpoolIncarnationMarkerStore,
  type SpoolIncarnationMarkerLocation
} from './spool-incarnation-marker-store'
import type {
  SpoolHostWorktreeInspection,
  SpoolHostWorktreeInspectionMode,
  SpoolOwnerWorktree,
  SpoolWorktreeRootComparison
} from './spool-worktree-incarnation'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'
import { inspectSpoolWslDirectoryIdentity } from './spool-wsl-canonical-directory'

type FolderDirectoryIdentity = { deviceId: string; inodeId: string }
type FolderDirectoryEvidence = {
  identity: FolderDirectoryIdentity
  markerLocation: SpoolIncarnationMarkerLocation
}

export type SpoolFolderWorkspaceIncarnationOptions = {
  /** Why: Windows-native paths can still execute inside a configured WSL project runtime. */
  resolveLocalWslDistro?: (
    target: SpoolOwnerWorktree
  ) => string | null | undefined | Promise<string | null | undefined>
}

/** Binds folder-workspace incarnations to a hidden marker on the actual host. */
export class SpoolFolderWorkspaceIncarnation {
  private readonly markers = new SpoolIncarnationMarkerStore()

  constructor(
    private readonly paths: SpoolActualHostPathResolver,
    private readonly options: SpoolFolderWorkspaceIncarnationOptions = {}
  ) {}

  async inspect(
    target: SpoolOwnerWorktree,
    mode: SpoolHostWorktreeInspectionMode,
    actualHostScope: string
  ): Promise<SpoolHostWorktreeInspection> {
    const root = await this.resolveRoot(target, actualHostScope)
    if (mode === 'resolve-root') {
      return { status: 'resolved', root, markerId: null, actualHostScope }
    }
    const before = await this.inspectDirectoryEvidence(target, root)
    if (!before) {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    const markerId = await this.markers.readOrCreate(
      before.markerLocation,
      SPOOL_FOLDER_INCARNATION_MARKER_FILENAME
    )
    const after = await this.inspectDirectoryEvidence(target, root)
    if (!after || !sameDirectoryEvidence(before, after)) {
      // Why: a marker read from a directory replaced during inspection cannot attest this root.
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    return {
      status: 'resolved',
      root,
      markerId: deriveFolderIncarnationId(actualHostScope, before.identity, markerId),
      actualHostScope
    }
  }

  private async resolveRoot(
    target: SpoolOwnerWorktree,
    actualHostScope: string
  ): Promise<SpoolWorktreeRootComparison> {
    const result = await this.paths.canonicalizePath(target, target.worktreePath)
    if (result.status === 'missing' || result.status === 'invalid') {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    if (result.status === 'unavailable') {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    if (result.path.scopeKey !== actualHostScope) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    return result.path
  }

  private async inspectDirectoryEvidence(
    target: SpoolOwnerWorktree,
    root: SpoolWorktreeRootComparison
  ): Promise<FolderDirectoryEvidence | null> {
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed || parsed.kind === 'runtime') {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    if (parsed.kind === 'ssh') {
      return await this.inspectSshDirectory(target, root, parsed.targetId)
    }
    return await this.inspectLocalDirectory(target, root)
  }

  private async inspectLocalDirectory(
    target: SpoolOwnerWorktree,
    root: SpoolWorktreeRootComparison
  ): Promise<FolderDirectoryEvidence | null> {
    if (target.connectionId?.trim()) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    const pathDistro = parseWslUncPath(target.worktreePath)?.distro ?? null
    const configuredDistro = (await this.options.resolveLocalWslDistro?.(target))?.trim() || null
    if (
      pathDistro &&
      configuredDistro &&
      pathDistro.toLowerCase() !== configuredDistro.toLowerCase()
    ) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    const wslDistro = pathDistro ?? configuredDistro
    if (wslDistro) {
      return await this.inspectWslDirectory(target.worktreePath, root, wslDistro)
    }
    try {
      const canonicalPath = await realpath(target.worktreePath)
      requireMatchingCanonicalRoot(canonicalPath, root)
      const stats = await stat(canonicalPath, { bigint: true })
      if (!stats.isDirectory()) {
        throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
      }
      if (stats.dev < 0n || stats.ino <= 0n) {
        return null
      }
      return {
        identity: { deviceId: stats.dev.toString(), inodeId: stats.ino.toString() },
        markerLocation: { kind: 'local', directory: canonicalPath }
      }
    } catch (error) {
      throw classifyDirectoryInspectionError(error)
    }
  }

  private async inspectWslDirectory(
    worktreePath: string,
    root: SpoolWorktreeRootComparison,
    wslDistro: string
  ): Promise<FolderDirectoryEvidence | null> {
    const result = await inspectSpoolWslDirectoryIdentity(worktreePath, wslDistro)
    if (result.status === 'unavailable') {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    if (result.status !== 'resolved') {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    requireMatchingCanonicalRoot(result.path, root)
    return {
      identity: { deviceId: result.deviceId, inodeId: result.inodeId },
      markerLocation: { kind: 'local', directory: result.path }
    }
  }

  private async inspectSshDirectory(
    target: SpoolOwnerWorktree,
    root: SpoolWorktreeRootComparison,
    targetId: string
  ): Promise<FolderDirectoryEvidence | null> {
    if (target.connectionId?.trim() && target.connectionId !== targetId) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    const filesystem = getSshFilesystemProvider(targetId)
    if (!filesystem) {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    try {
      const canonicalPath = await filesystem.realpath(target.worktreePath)
      requireMatchingCanonicalRoot(canonicalPath, root)
      const verified = filesystem.spoolVerifiedFiles
      if (!verified) {
        throw new SpoolWorktreeIncarnationHostError('host-unavailable')
      }
      const identity = await verified.inspectDirectoryIdentity(canonicalPath)
      requireMatchingCanonicalRoot(identity.canonicalPath, root)
      return {
        identity: { deviceId: identity.deviceId, inodeId: identity.inodeId },
        markerLocation: { kind: 'ssh', filesystem, directory: identity.canonicalPath }
      }
    } catch (error) {
      throw classifyDirectoryInspectionError(error)
    }
  }
}

function deriveFolderIncarnationId(
  actualHostScope: string,
  identity: FolderDirectoryIdentity,
  markerId: string
): string {
  // Why: the marker prevents inode reuse while host identity prevents copied markers inheriting access.
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        'yiru-spool-folder-incarnation-v2',
        actualHostScope,
        markerId,
        identity.deviceId,
        identity.inodeId
      ])
    )
    .digest()
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = digest.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function requireMatchingCanonicalRoot(
  canonicalPath: string,
  root: SpoolWorktreeRootComparison
): void {
  if (normalizeRuntimePathForComparison(canonicalPath) !== root.rootKey) {
    // Why: the physical identity must belong to the same canonical directory proven for sharing.
    throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
  }
}

function classifyDirectoryInspectionError(error: unknown): SpoolWorktreeIncarnationHostError {
  if (error instanceof SpoolWorktreeIncarnationHostError) {
    return error
  }
  const message = error instanceof Error ? error.message : ''
  const integrityFailure =
    message === 'remote_spool_directory_identity_invalid' ||
    message === 'spool_marker_directory_invalid' ||
    message === 'spool_marker_path_stale'
  const reason =
    integrityFailure ||
    isMissingSpoolFilesystemError(error) ||
    isDefinitiveSpoolFilesystemFailure(error)
      ? 'marker-unavailable'
      : 'host-unavailable'
  return new SpoolWorktreeIncarnationHostError(reason, { cause: error })
}

function sameDirectoryEvidence(
  left: FolderDirectoryEvidence,
  right: FolderDirectoryEvidence
): boolean {
  return (
    left.identity.deviceId === right.identity.deviceId &&
    left.identity.inodeId === right.identity.inodeId &&
    left.markerLocation.kind === right.markerLocation.kind &&
    left.markerLocation.directory === right.markerLocation.directory
  )
}
