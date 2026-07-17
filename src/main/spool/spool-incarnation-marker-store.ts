import { randomUUID } from 'node:crypto'
import { parseWslUncPath } from '../../shared/wsl-paths'
import type { IFilesystemProvider } from '../providers/types'
import { classifySpoolIncarnationMarkerIoError } from './spool-incarnation-marker-error'
import { readOrCreateSpoolLocalIncarnationMarker } from './spool-local-incarnation-marker'
import { readOrCreateSpoolWslIncarnationMarker } from './spool-wsl-incarnation-marker'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'

const INCARNATION_MARKER_FILENAME = 'yiru-spool-incarnation-v1'
export const SPOOL_FOLDER_INCARNATION_MARKER_FILENAME = '.yiru-spool-incarnation-v1'
export const SPOOL_FOLDER_INCARNATION_TEMP_PREFIX = `${SPOOL_FOLDER_INCARNATION_MARKER_FILENAME}.tmp-`

export type SpoolIncarnationMarkerLocation =
  | { kind: 'local'; directory: string }
  | {
      kind: 'ssh'
      filesystem: IFilesystemProvider
      directory: string
    }

export class SpoolIncarnationMarkerStore {
  private readonly localPendingOperations = new Map<string, Promise<string>>()
  private readonly remotePendingOperations = new WeakMap<
    IFilesystemProvider,
    Map<string, Promise<string>>
  >()

  readOrCreate(
    location: SpoolIncarnationMarkerLocation,
    filename = INCARNATION_MARKER_FILENAME
  ): Promise<string> {
    const pendingOperations = this.pendingOperationsFor(location)
    const key = `${location.directory}\0${filename}`
    const existing = pendingOperations.get(key)
    if (existing) {
      return existing
    }
    const pending = readOrCreateMarkerAtLocation(location, filename).finally(() => {
      if (pendingOperations.get(key) === pending) {
        pendingOperations.delete(key)
      }
    })
    pendingOperations.set(key, pending)
    return pending
  }

  private pendingOperationsFor(
    location: SpoolIncarnationMarkerLocation
  ): Map<string, Promise<string>> {
    if (location.kind === 'local') {
      return this.localPendingOperations
    }
    let operations = this.remotePendingOperations.get(location.filesystem)
    if (!operations) {
      operations = new Map()
      this.remotePendingOperations.set(location.filesystem, operations)
    }
    return operations
  }
}

function readOrCreateMarkerAtLocation(
  location: SpoolIncarnationMarkerLocation,
  filename: string
): Promise<string> {
  if (location.kind === 'ssh') {
    return readOrCreateRemoteMarker(location.filesystem, location.directory, filename)
  }
  if (parseWslUncPath(location.directory)) {
    // Why: Win32 cannot publish hardlinks inside a WSL distro filesystem.
    return readOrCreateSpoolWslIncarnationMarker(location.directory, filename, randomUUID())
  }
  return readOrCreateSpoolLocalIncarnationMarker(location.directory, filename)
}

async function readOrCreateRemoteMarker(
  filesystem: IFilesystemProvider,
  directory: string,
  filename: string
): Promise<string> {
  try {
    const verified = filesystem.spoolVerifiedFiles
    if (!verified) {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    // Why: marker creation must remain exclusive and no-follow on the remote host.
    return await verified.readOrCreateIncarnationMarker(directory, filename, randomUUID())
  } catch (error) {
    if (isRemoteMarkerIntegrityError(error)) {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable', { cause: error })
    }
    throw classifySpoolIncarnationMarkerIoError(error)
  }
}

function isRemoteMarkerIntegrityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return message.startsWith('spool_marker_') || message === 'remote_spool_marker_invalid'
}
