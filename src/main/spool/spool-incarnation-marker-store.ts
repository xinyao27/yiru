import { randomUUID } from 'node:crypto'
import { link, lstat, open, readFile, rm } from 'node:fs/promises'
import { parseWslUncPath } from '../../shared/wsl-paths'
import type { IFilesystemProvider } from '../providers/types'
import { joinRemotePath, type RemoteHostPlatform } from '../ssh/ssh-remote-platform'
import {
  isDefinitiveSpoolFilesystemFailure,
  isExistingSpoolFilesystemError,
  isMissingSpoolFilesystemError,
  joinSpoolLocalPath
} from './spool-canonical-host-path'
import {
  inspectSpoolWslFile,
  resolveSpoolWslCanonicalDirectory
} from './spool-wsl-canonical-directory'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'

const INCARNATION_MARKER_FILENAME = 'orca-spool-incarnation-v1'
const MAX_MARKER_BYTES = 128
const MARKER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export type SpoolIncarnationMarkerLocation =
  | { kind: 'local'; gitDirectory: string }
  | {
      kind: 'ssh'
      filesystem: IFilesystemProvider
      platform: RemoteHostPlatform
      gitDirectory: string
    }

export class SpoolIncarnationMarkerStore {
  private readonly pendingOperations = new Map<string, Promise<string>>()

  readOrCreate(location: SpoolIncarnationMarkerLocation): Promise<string> {
    const markerPath =
      location.kind === 'local'
        ? joinSpoolLocalPath(location.gitDirectory, INCARNATION_MARKER_FILENAME)
        : joinRemotePath(location.platform, location.gitDirectory, INCARNATION_MARKER_FILENAME)
    const key = `${location.kind}\0${markerPath}`
    const existing = this.pendingOperations.get(key)
    if (existing) {
      return existing
    }
    const pending = (
      location.kind === 'local'
        ? readOrCreateLocalMarker(markerPath, location.gitDirectory)
        : readOrCreateRemoteMarker(location.filesystem, markerPath)
    ).finally(() => {
      if (this.pendingOperations.get(key) === pending) {
        this.pendingOperations.delete(key)
      }
    })
    this.pendingOperations.set(key, pending)
    return pending
  }
}

async function readOrCreateLocalMarker(markerPath: string, gitDirectory: string): Promise<string> {
  let existing: string | null
  try {
    existing = await readLocalMarker(markerPath)
  } catch (error) {
    throw classifyMarkerIoError(error)
  }
  if (existing) {
    return existing
  }
  const markerId = randomUUID()
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${randomUUID()}`
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(temporaryPath, 'wx', 0o600)
    await handle.writeFile(`${markerId}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    try {
      // Why: hard-link publication is atomic and cannot replace another process's marker.
      await link(temporaryPath, markerPath)
      await syncDirectoryBestEffort(gitDirectory)
      return markerId
    } catch (error) {
      if (!isExistingSpoolFilesystemError(error)) {
        throw error
      }
      const racedMarker = await readLocalMarker(markerPath)
      if (racedMarker) {
        return racedMarker
      }
      throw error
    }
  } catch (error) {
    if (isMissingSpoolFilesystemError(error) && parseWslUncPath(markerPath)) {
      const gitDirectoryEvidence = await resolveSpoolWslCanonicalDirectory(gitDirectory)
      if (
        gitDirectoryEvidence.status === 'resolved' ||
        gitDirectoryEvidence.status === 'unavailable'
      ) {
        throw new SpoolWorktreeIncarnationHostError('host-unavailable', { cause: error })
      }
    }
    throw classifyMarkerIoError(error)
  } finally {
    await handle?.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function readLocalMarker(markerPath: string): Promise<string | null> {
  try {
    const stat = await lstat(markerPath)
    if (!stat.isFile() || stat.size > MAX_MARKER_BYTES) {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    return requireMarkerId(await readFile(markerPath, 'utf8'))
  } catch (error) {
    if (isMissingSpoolFilesystemError(error)) {
      if (parseWslUncPath(markerPath)) {
        const evidence = await inspectSpoolWslFile(markerPath)
        if (evidence !== 'missing') {
          throw new SpoolWorktreeIncarnationHostError('host-unavailable', { cause: error })
        }
      }
      return null
    }
    throw error
  }
}

async function readOrCreateRemoteMarker(
  filesystem: IFilesystemProvider,
  markerPath: string
): Promise<string> {
  try {
    const existing = await readRemoteMarker(filesystem, markerPath)
    if (existing) {
      return existing
    }
    const markerId = randomUUID()
    try {
      // Why: the relay's createFile uses exclusive-create, so concurrent owners cannot replace IDs.
      await filesystem.createFile(markerPath)
    } catch (error) {
      if (!isExistingSpoolFilesystemError(error)) {
        throw error
      }
      const racedMarker = await readRemoteMarker(filesystem, markerPath)
      if (racedMarker) {
        return racedMarker
      }
      throw error
    }
    if (!filesystem.lstat || (await filesystem.lstat(markerPath)).type !== 'file') {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    await filesystem.writeFile(markerPath, `${markerId}\n`)
    return markerId
  } catch (error) {
    throw classifyMarkerIoError(error)
  }
}

async function readRemoteMarker(
  filesystem: IFilesystemProvider,
  markerPath: string
): Promise<string | null> {
  if (!filesystem.lstat) {
    throw new Error('remote lstat unavailable')
  }
  try {
    const stat = await filesystem.lstat(markerPath)
    if (stat.type !== 'file' || stat.size > MAX_MARKER_BYTES) {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    const result = await filesystem.readFile(markerPath)
    if (result.isBinary) {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    return requireMarkerId(result.content)
  } catch (error) {
    if (isMissingSpoolFilesystemError(error)) {
      return null
    }
    throw error
  }
}

function requireMarkerId(content: string): string {
  const markerId = content.endsWith('\n') ? content.slice(0, -1) : content
  if (!MARKER_ID_PATTERN.test(markerId)) {
    throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
  }
  return markerId
}

function classifyMarkerIoError(error: unknown): SpoolWorktreeIncarnationHostError {
  if (error instanceof SpoolWorktreeIncarnationHostError) {
    return error
  }
  return new SpoolWorktreeIncarnationHostError(
    isMissingSpoolFilesystemError(error) ||
      isExistingSpoolFilesystemError(error) ||
      isDefinitiveSpoolFilesystemFailure(error)
      ? 'marker-unavailable'
      : 'host-unavailable',
    { cause: error }
  )
}

async function syncDirectoryBestEffort(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(directory, 'r')
    await handle.sync()
  } catch {
    // The marker is already durable enough on hosts that cannot fsync directories (notably Windows).
  } finally {
    await handle?.close().catch(() => undefined)
  }
}
