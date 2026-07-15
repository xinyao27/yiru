import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { link, lstat, open, opendir, realpath, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isSpoolIncarnationMarkerId } from '../shared/spool/spool-incarnation-marker-id'
import { hasExactSpoolWireKeys } from '../shared/spool/spool-exact-wire-record'
import type { RelayDispatcher, RequestContext } from './dispatcher'
import {
  openRelaySpoolExclusiveFile,
  relaySpoolAbsolutePath,
  relaySpoolThrowIfAborted,
  writeRelaySpoolFile
} from './fs-handler-spool-path-proof'

const OPEN_NOFOLLOW = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
const OPEN_NONBLOCK = typeof constants.O_NONBLOCK === 'number' ? constants.O_NONBLOCK : 0
const OPEN_DIRECTORY = typeof constants.O_DIRECTORY === 'number' ? constants.O_DIRECTORY : 0
const MAX_MARKER_BYTES = 128n
const MARKER_FILENAMES = new Set(['orca-spool-incarnation-v1', '.orca-spool-incarnation-v1'])

export function registerSpoolIncarnationMarkerHandler(dispatcher: RelayDispatcher): void {
  dispatcher.onRequest('fs.spoolInspectDirectoryIdentity', inspectSpoolDirectoryIdentity)
  dispatcher.onRequest('fs.spoolReadOrCreateIncarnationMarker', readOrCreateSpoolIncarnationMarker)
}

async function inspectSpoolDirectoryIdentity(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ canonicalPath: string; deviceId: string; inodeId: string }> {
  if (!hasExactSpoolWireKeys(params, ['directoryPath'])) {
    throw new Error('spool_marker_parameter_invalid')
  }
  relaySpoolThrowIfAborted(context.signal)
  const canonicalPath = await realpath(relaySpoolAbsolutePath(params.directoryPath))
  const handle = await open(canonicalPath, constants.O_RDONLY | OPEN_DIRECTORY | OPEN_NOFOLLOW)
  try {
    const before = await requireBigIntDirectory(handle)
    relaySpoolThrowIfAborted(context.signal)
    requireSameBigIntIdentity(before, await stat(canonicalPath, { bigint: true }))
    requireSameBigIntIdentity(before, await requireBigIntDirectory(handle))
    return {
      canonicalPath,
      deviceId: before.dev.toString(),
      inodeId: before.ino.toString()
    }
  } finally {
    await handle.close().catch(() => {})
  }
}

async function readOrCreateSpoolIncarnationMarker(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ markerId: string }> {
  if (
    !hasExactSpoolWireKeys(params, ['directoryPath', 'filename', 'proposedMarkerId']) ||
    typeof params.filename !== 'string' ||
    !MARKER_FILENAMES.has(params.filename) ||
    !isSpoolIncarnationMarkerId(params.proposedMarkerId)
  ) {
    throw new Error('spool_marker_parameter_invalid')
  }
  relaySpoolThrowIfAborted(context.signal)
  const directoryPath = await realpath(relaySpoolAbsolutePath(params.directoryPath))
  const directory = await open(directoryPath, constants.O_RDONLY | OPEN_DIRECTORY | OPEN_NOFOLLOW)
  try {
    const directoryIdentity = await requireBigIntDirectory(directory)
    const descriptorBound = process.platform === 'linux'
    await requireDirectoryPathIdentity(directoryPath, directoryIdentity)
    const markerRoot = descriptorBound ? join('/proc/self/fd', String(directory.fd)) : directoryPath
    const markerPath = join(markerRoot, params.filename)
    const markerId = await readOrCreateMarkerFile(
      markerPath,
      params.proposedMarkerId,
      directory,
      context.signal
    )
    requireSameBigIntIdentity(directoryIdentity, await requireBigIntDirectory(directory))
    await requireDirectoryPathIdentity(directoryPath, directoryIdentity)
    return { markerId }
  } finally {
    await directory.close().catch(() => {})
  }
}

async function readOrCreateMarkerFile(
  markerPath: string,
  proposedMarkerId: string,
  directory: FileHandle,
  signal?: AbortSignal
): Promise<string> {
  try {
    return await readMarkerFile(markerPath, directory, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${randomUUID()}`
  let handle: FileHandle | null = null
  let temporaryPresent = false
  try {
    handle = await openRelaySpoolExclusiveFile(temporaryPath, 0o600)
    temporaryPresent = true
    signal?.throwIfAborted()
    await writeRelaySpoolFile(handle, Buffer.from(`${proposedMarkerId}\n`, 'utf8'))
    await handle.sync()
    await handle.close()
    handle = null
    signal?.throwIfAborted()
    try {
      // Why: hard-link publication cannot expose a partial marker or replace a concurrent ID.
      await link(temporaryPath, markerPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      await rm(temporaryPath)
      temporaryPresent = false
      await directory.sync().catch(() => {})
      return await readMarkerFile(markerPath, directory, signal)
    }
    await removePublishedTemporaryMarker(temporaryPath)
    temporaryPresent = false
    await directory.sync().catch(() => {})
    return await readMarkerFile(markerPath, directory)
  } finally {
    await handle?.close().catch(() => {})
    if (temporaryPresent) {
      await rm(temporaryPath, { force: true }).catch(() => {})
    }
  }
}

async function removePublishedTemporaryMarker(temporaryPath: string): Promise<void> {
  try {
    await rm(temporaryPath)
  } catch (error) {
    // Why: a concurrent reader may already remove the linked temp during crash recovery.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

async function readMarkerFile(
  markerPath: string,
  directory: FileHandle,
  signal?: AbortSignal
): Promise<string> {
  await requireCanonicalMarkerName(markerPath)
  let before = await lstat(markerPath, { bigint: true })
  if (before.isFile() && before.nlink > 1n) {
    await removeStaleMarkerAliases(markerPath, directory, before)
    before = await lstat(markerPath, { bigint: true })
  }
  if (!before.isFile() || before.nlink !== 1n || before.size > MAX_MARKER_BYTES) {
    throw new Error('spool_marker_unavailable')
  }
  const handle = await open(markerPath, constants.O_RDONLY | OPEN_NOFOLLOW | OPEN_NONBLOCK)
  try {
    const opened = await handle.stat({ bigint: true })
    requireSameIdentity(before, opened)
    if (!opened.isFile() || opened.nlink !== 1n || opened.size > MAX_MARKER_BYTES) {
      throw new Error('spool_marker_unavailable')
    }
    signal?.throwIfAborted()
    const bytes = Buffer.alloc(Number(MAX_MARKER_BYTES) + 1)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    const after = await handle.stat({ bigint: true })
    requireSameIdentity(opened, after)
    if (
      after.nlink !== 1n ||
      bytesRead > Number(MAX_MARKER_BYTES) ||
      after.size !== BigInt(bytesRead)
    ) {
      throw new Error('spool_marker_unavailable')
    }
    await requireCanonicalMarkerName(markerPath)
    const content = bytes.subarray(0, bytesRead).toString('utf8')
    const markerId = content.endsWith('\n') ? content.slice(0, -1) : content
    if (!isSpoolIncarnationMarkerId(markerId)) {
      throw new Error('spool_marker_unavailable')
    }
    await handle.chmod(0o600).catch(() => {})
    return markerId
  } finally {
    await handle.close().catch(() => {})
  }
}

async function removeStaleMarkerAliases(
  markerPath: string,
  directoryHandle: FileHandle,
  markerStats: BigIntStats
): Promise<void> {
  const directoryPath = dirname(markerPath)
  const temporaryPrefix = `${basename(markerPath)}.tmp-`
  const directory = await opendir(directoryPath)
  try {
    for await (const entry of directory) {
      if (!entry.name.startsWith(temporaryPrefix)) {
        continue
      }
      const candidatePath = join(directoryPath, entry.name)
      try {
        const stats = await lstat(candidatePath, { bigint: true })
        if (stats.isFile() && stats.dev === markerStats.dev && stats.ino === markerStats.ino) {
          await rm(candidatePath)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }
  } finally {
    await directory.close().catch(() => {})
  }
  await directoryHandle.sync().catch(() => {})
}

async function requireCanonicalMarkerName(markerPath: string): Promise<void> {
  if (basename(await realpath(markerPath)) !== basename(markerPath)) {
    throw new Error('spool_marker_unavailable')
  }
}

function requireSameIdentity(left: BigIntStats, right: BigIntStats): void {
  if (left.dev !== right.dev || left.ino !== right.ino) {
    throw new Error('spool_marker_path_stale')
  }
}

async function requireDirectoryPathIdentity(
  directoryPath: string,
  expected: { dev: bigint; ino: bigint }
): Promise<void> {
  if ((await realpath(directoryPath)) !== directoryPath) {
    throw new Error('spool_marker_path_stale')
  }
  requireSameBigIntIdentity(expected, await stat(directoryPath, { bigint: true }))
}

async function requireBigIntDirectory(handle: FileHandle): Promise<BigIntStats> {
  const stats = await handle.stat({ bigint: true })
  if (!stats.isDirectory() || stats.dev < 0n || stats.ino <= 0n) {
    throw new Error('spool_marker_directory_invalid')
  }
  return stats
}

function requireSameBigIntIdentity(
  left: { dev: bigint; ino: bigint },
  right: { dev: bigint; ino: bigint }
): void {
  if (left.dev !== right.dev || left.ino !== right.ino) {
    throw new Error('spool_marker_path_stale')
  }
}
