import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, open, opendir, realpath, rm, stat } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

import { isCoworkingIncarnationMarkerId } from '../../shared/coworking/incarnation-marker-id'
import {
  isExistingCoworkingFilesystemError,
  isMissingCoworkingFilesystemError,
  joinCoworkingLocalPath
} from './canonical-host-path'
import { classifyCoworkingIncarnationMarkerIoError } from './incarnation-marker-error'
import { CoworkingWorktreeIncarnationHostError } from './worktree-incarnation'

const OPEN_NOFOLLOW = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
const OPEN_NONBLOCK = typeof constants.O_NONBLOCK === 'number' ? constants.O_NONBLOCK : 0
const OPEN_DIRECTORY = typeof constants.O_DIRECTORY === 'number' ? constants.O_DIRECTORY : 0
const MAX_MARKER_BYTES = 128n

type DirectoryIdentity = { dev: bigint; ino: bigint }

export async function readOrCreateCoworkingLocalIncarnationMarker(
  directory: string,
  filename: string
): Promise<string> {
  try {
    const canonicalDirectory = await realpath(directory)
    const directoryHandle = await open(
      canonicalDirectory,
      constants.O_RDONLY | OPEN_DIRECTORY | OPEN_NOFOLLOW
    )
    try {
      const identity = await requireDirectory(directoryHandle)
      const descriptorBound = process.platform === 'linux'
      await requireDirectoryPathIdentity(canonicalDirectory, identity)
      const operationDirectory = descriptorBound
        ? joinCoworkingLocalPath('/proc/self/fd', String(directoryHandle.fd))
        : canonicalDirectory
      const markerId = await readOrCreateBoundMarker(
        joinCoworkingLocalPath(operationDirectory, filename),
        operationDirectory
      )
      requireSameIdentity(identity, await requireDirectory(directoryHandle))
      await requireDirectoryPathIdentity(canonicalDirectory, identity)
      return markerId
    } finally {
      await directoryHandle.close().catch(() => undefined)
    }
  } catch (error) {
    throw classifyCoworkingIncarnationMarkerIoError(error)
  }
}

async function readOrCreateBoundMarker(markerPath: string, directory: string): Promise<string> {
  const existing = await readMarker(markerPath)
  if (existing) {
    return existing
  }
  const markerId = randomUUID()
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${randomUUID()}`
  let handle: Awaited<ReturnType<typeof open>> | null = null
  let temporaryPresent = false
  try {
    handle = await open(temporaryPath, 'wx', 0o600)
    temporaryPresent = true
    await handle.writeFile(`${markerId}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    try {
      // Why: hard-link publication is atomic and cannot replace another process's marker.
      await link(temporaryPath, markerPath)
      await removePublishedTemporaryMarker(temporaryPath)
      temporaryPresent = false
      await syncDirectoryBestEffort(directory)
      const publishedMarker = await readMarker(markerPath)
      if (!publishedMarker) {
        throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
      }
      return publishedMarker
    } catch (error) {
      if (!isExistingCoworkingFilesystemError(error)) {
        throw error
      }
      await rm(temporaryPath, { force: true })
      temporaryPresent = false
      await syncDirectoryBestEffort(directory)
      const racedMarker = await readMarker(markerPath)
      if (racedMarker) {
        return racedMarker
      }
      throw error
    }
  } finally {
    await handle?.close().catch(() => undefined)
    if (temporaryPresent) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }
}

async function removePublishedTemporaryMarker(temporaryPath: string): Promise<void> {
  try {
    await rm(temporaryPath)
  } catch (error) {
    // Why: a concurrent reader may already remove the linked temp during crash recovery.
    if (!isMissingCoworkingFilesystemError(error)) {
      throw error
    }
  }
}

async function readMarker(markerPath: string): Promise<string | null> {
  try {
    await requireCanonicalMarkerName(markerPath)
    let before = await lstat(markerPath, { bigint: true })
    if (before.isFile() && before.nlink > 1n) {
      await removeStaleMarkerAliases(markerPath, before.dev, before.ino)
      before = await lstat(markerPath, { bigint: true })
    }
    if (!before.isFile() || before.nlink !== 1n || before.size > MAX_MARKER_BYTES) {
      throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
    }
    const handle = await open(markerPath, constants.O_RDONLY | OPEN_NOFOLLOW | OPEN_NONBLOCK)
    try {
      const opened = await handle.stat({ bigint: true })
      if (
        !opened.isFile() ||
        opened.nlink !== 1n ||
        opened.size > MAX_MARKER_BYTES ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino
      ) {
        throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
      }
      const bytes = Buffer.alloc(Number(MAX_MARKER_BYTES) + 1)
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
      const after = await handle.stat({ bigint: true })
      if (
        after.dev !== opened.dev ||
        after.ino !== opened.ino ||
        after.nlink !== 1n ||
        bytesRead > Number(MAX_MARKER_BYTES) ||
        after.size !== BigInt(bytesRead)
      ) {
        throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
      }
      await requireCanonicalMarkerName(markerPath)
      return requireMarkerId(bytes.subarray(0, bytesRead).toString('utf8'))
    } finally {
      await handle.close().catch(() => undefined)
    }
  } catch (error) {
    if (isMissingCoworkingFilesystemError(error)) {
      return null
    }
    throw error
  }
}

async function removeStaleMarkerAliases(
  markerPath: string,
  deviceId: bigint,
  inodeId: bigint
): Promise<void> {
  const directoryPath = dirname(markerPath)
  const temporaryPrefix = `${basename(markerPath)}.tmp-`
  const directory = await opendir(directoryPath)
  try {
    for await (const entry of directory) {
      if (!entry.name.startsWith(temporaryPrefix)) {
        continue
      }
      const candidatePath = joinCoworkingLocalPath(directoryPath, entry.name)
      try {
        const stats = await lstat(candidatePath, { bigint: true })
        if (stats.isFile() && stats.dev === deviceId && stats.ino === inodeId) {
          await rm(candidatePath)
        }
      } catch (error) {
        if (!isMissingCoworkingFilesystemError(error)) {
          throw error
        }
      }
    }
  } finally {
    await directory.close().catch(() => undefined)
  }
  await syncDirectoryBestEffort(directoryPath)
}

async function requireCanonicalMarkerName(markerPath: string): Promise<void> {
  if (basename(await realpath(markerPath)) !== basename(markerPath)) {
    // Why: a case-renamed reserved marker must not become visible on case-insensitive filesystems.
    throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
  }
}

function requireMarkerId(content: string): string {
  const markerId = content.endsWith('\n') ? content.slice(0, -1) : content
  if (!isCoworkingIncarnationMarkerId(markerId) || content.length > 37) {
    throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
  }
  return markerId
}

async function requireDirectory(
  handle: Awaited<ReturnType<typeof open>>
): Promise<DirectoryIdentity> {
  const stats = await handle.stat({ bigint: true })
  if (!stats.isDirectory() || stats.dev < 0n || stats.ino <= 0n) {
    throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
  }
  return { dev: stats.dev, ino: stats.ino }
}

async function requireDirectoryPathIdentity(
  directory: string,
  expected: DirectoryIdentity
): Promise<void> {
  if ((await realpath(directory)) !== directory) {
    throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
  }
  const current = await stat(directory, { bigint: true })
  requireSameIdentity(expected, current)
}

function requireSameIdentity(expected: DirectoryIdentity, current: DirectoryIdentity): void {
  if (expected.dev !== current.dev || expected.ino !== current.ino) {
    throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
  }
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
