import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'

import { normalizeRuntimePathForComparison } from '@yiru/workbench-model/platform'
import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import type { CoworkingActualHostPathResolver } from './actual-host-path-resolver'
import {
  isDefinitiveCoworkingFilesystemFailure,
  isMissingCoworkingFilesystemError
} from './canonical-host-path'
import {
  COWORKING_FOLDER_INCARNATION_MARKER_FILENAME,
  CoworkingIncarnationMarkerStore,
  type CoworkingIncarnationMarkerLocation
} from './incarnation-marker-store'
import type {
  CoworkingHostWorktreeInspection,
  CoworkingHostWorktreeInspectionMode,
  CoworkingOwnerWorktree,
  CoworkingWorktreeRootComparison
} from './worktree-incarnation'
import { CoworkingWorktreeIncarnationHostError } from './worktree-incarnation'
import { inspectCoworkingWslDirectoryIdentity } from './wsl-canonical-directory'

type FolderDirectoryIdentity = { deviceId: string; inodeId: string }
type FolderDirectoryEvidence = {
  identity: FolderDirectoryIdentity
  markerLocation: CoworkingIncarnationMarkerLocation
}

export type CoworkingFolderWorkspaceIncarnationOptions = {
  /** Why: Windows-native paths can still execute inside a configured WSL project runtime. */
  resolveLocalWslDistro?: (
    target: CoworkingOwnerWorktree
  ) => string | null | undefined | Promise<string | null | undefined>
}

/** Binds folder-workspace incarnations to a hidden marker on the actual host. */
export class CoworkingFolderWorkspaceIncarnation {
  private readonly markers = new CoworkingIncarnationMarkerStore()

  constructor(
    private readonly paths: CoworkingActualHostPathResolver,
    private readonly options: CoworkingFolderWorkspaceIncarnationOptions = {}
  ) {}

  async inspect(
    target: CoworkingOwnerWorktree,
    mode: CoworkingHostWorktreeInspectionMode,
    actualHostScope: string
  ): Promise<CoworkingHostWorktreeInspection> {
    const root = await this.resolveRoot(target, actualHostScope)
    if (mode === 'resolve-root') {
      return { status: 'resolved', root, markerId: null, actualHostScope }
    }
    const before = await this.inspectDirectoryEvidence(target, root)
    if (!before) {
      throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
    }
    const markerId = await this.markers.readOrCreate(
      before.markerLocation,
      COWORKING_FOLDER_INCARNATION_MARKER_FILENAME
    )
    const after = await this.inspectDirectoryEvidence(target, root)
    if (!after || !sameDirectoryEvidence(before, after)) {
      // Why: a marker read from a directory replaced during inspection cannot attest this root.
      throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
    }
    return {
      status: 'resolved',
      root,
      markerId: deriveFolderIncarnationId(actualHostScope, before.identity, markerId),
      actualHostScope
    }
  }

  private async resolveRoot(
    target: CoworkingOwnerWorktree,
    actualHostScope: string
  ): Promise<CoworkingWorktreeRootComparison> {
    const result = await this.paths.canonicalizePath(target, target.worktreePath)
    if (result.status === 'missing' || result.status === 'invalid') {
      throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
    }
    if (result.status === 'unavailable') {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable')
    }
    if (result.path.scopeKey !== actualHostScope) {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    return result.path
  }

  private async inspectDirectoryEvidence(
    target: CoworkingOwnerWorktree,
    root: CoworkingWorktreeRootComparison
  ): Promise<FolderDirectoryEvidence | null> {
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed || parsed.kind === 'runtime') {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    return await this.inspectLocalDirectory(target, root)
  }

  private async inspectLocalDirectory(
    target: CoworkingOwnerWorktree,
    root: CoworkingWorktreeRootComparison
  ): Promise<FolderDirectoryEvidence | null> {
    if (target.connectionId?.trim()) {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    const pathDistro = parseWslUncPath(target.worktreePath)?.distro ?? null
    const configuredDistro = (await this.options.resolveLocalWslDistro?.(target))?.trim() || null
    if (
      pathDistro &&
      configuredDistro &&
      pathDistro.toLowerCase() !== configuredDistro.toLowerCase()
    ) {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
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
        throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
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
    root: CoworkingWorktreeRootComparison,
    wslDistro: string
  ): Promise<FolderDirectoryEvidence | null> {
    const result = await inspectCoworkingWslDirectoryIdentity(worktreePath, wslDistro)
    if (result.status === 'unavailable') {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable')
    }
    if (result.status !== 'resolved') {
      throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
    }
    requireMatchingCanonicalRoot(result.path, root)
    return {
      identity: { deviceId: result.deviceId, inodeId: result.inodeId },
      markerLocation: { kind: 'local', directory: result.path }
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
        'yiru-coworking-folder-incarnation-v2',
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
  root: CoworkingWorktreeRootComparison
): void {
  if (normalizeRuntimePathForComparison(canonicalPath) !== root.rootKey) {
    // Why: the physical identity must belong to the same canonical directory proven for sharing.
    throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
  }
}

function classifyDirectoryInspectionError(error: unknown): CoworkingWorktreeIncarnationHostError {
  if (error instanceof CoworkingWorktreeIncarnationHostError) {
    return error
  }
  const message = error instanceof Error ? error.message : ''
  const integrityFailure =
    message === 'remote_coworking_directory_identity_invalid' ||
    message === 'coworking_marker_directory_invalid' ||
    message === 'coworking_marker_path_stale'
  const reason =
    integrityFailure ||
    isMissingCoworkingFilesystemError(error) ||
    isDefinitiveCoworkingFilesystemFailure(error)
      ? 'marker-unavailable'
      : 'host-unavailable'
  return new CoworkingWorktreeIncarnationHostError(reason, { cause: error })
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
