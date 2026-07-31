import { constants } from 'node:fs'
import { mkdir, opendir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { hasExactCoworkingWireKeys } from '~shared/coworking/exact-wire-record'
import {
  COWORKING_FILE_LIST_VERIFIED_HOST_MAX_LIMIT,
  COWORKING_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT,
  COWORKING_FILE_READ_MAX_BYTES,
  COWORKING_FILE_WRITE_MAX_BYTES
} from '~shared/coworking/operation-contract'
import { assertNoClobberRenameDestinationAvailable } from '~shared/filesystem-rename-collision'

import type { RelayDispatcher, RequestContext } from '../dispatcher'
import { registerCoworkingIncarnationMarkerHandler } from './handler-coworking-incarnation-marker'
import {
  assertRelayCoworkingPathMissing,
  openRelayCoworkingExclusiveFile,
  openRelayCoworkingVerifiedDirectory,
  openRelayCoworkingVerifiedFile,
  relayCoworkingAbsolutePath,
  relayCoworkingBase64,
  relayCoworkingBoolean,
  relayCoworkingExistingPathProof,
  relayCoworkingInteger,
  relayCoworkingThrowIfAborted,
  requireRelayCoworkingStats,
  verifyRelayCoworkingPath,
  writeRelayCoworkingFile,
  type RelayCoworkingExistingPathProof
} from './handler-coworking-path-proof'

export function registerCoworkingVerifiedFilesystemHandlers(dispatcher: RelayDispatcher): void {
  registerCoworkingIncarnationMarkerHandler(dispatcher)
  dispatcher.onRequest('fs.coworkingListVerified', listCoworkingDirectoryVerified)
  dispatcher.onRequest('fs.coworkingReadVerified', readCoworkingFileVerified)
  dispatcher.onRequest('fs.coworkingWriteVerified', writeCoworkingFileVerified)
  dispatcher.onRequest('fs.coworkingCreateDirectoryVerified', createCoworkingDirectoryVerified)
  dispatcher.onRequest('fs.coworkingRenameVerified', renameCoworkingPathVerified)
  dispatcher.onRequest('fs.coworkingDeleteVerified', deleteCoworkingPathVerified)
}

async function listCoworkingDirectoryVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{
  entries: readonly { name: string; kind: 'file' | 'directory' | 'symlink' }[]
  nextOffset: number | null
}> {
  requireOnlyKeys(params, ['target', 'offset', 'limit'])
  const target = relayCoworkingExistingPathProof(params.target)
  const offset = relayCoworkingInteger(
    params.offset,
    0,
    COWORKING_FILE_LIST_VERIFIED_HOST_MAX_LIMIT
  )
  const limit = relayCoworkingInteger(params.limit, 1, COWORKING_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT)
  relayCoworkingThrowIfAborted(context.signal)
  const { handle } = await openRelayCoworkingVerifiedDirectory(target)
  try {
    const descriptorBound = process.platform === 'linux'
    if (!descriptorBound) {
      await verifyRelayCoworkingPath(target, 'directory')
    }
    const directory = await opendir(
      descriptorBound ? verifiedDirectoryDescriptorPath(handle.fd) : target.path
    )
    try {
      if (!descriptorBound) {
        await verifyRelayCoworkingPath(target, 'directory')
      }
      const entries: { name: string; kind: 'file' | 'directory' | 'symlink' }[] = []
      let seen = 0
      for await (const entry of directory) {
        relayCoworkingThrowIfAborted(context.signal)
        if (seen < offset) {
          seen += 1
          continue
        }
        entries.push({
          name: entry.name,
          kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : 'file'
        })
        if (entries.length > limit) {
          break
        }
      }
      requireRelayCoworkingStats(await handle.stat(), target.expectedStatIdentity, 'directory')
      if (!descriptorBound) {
        // Why: non-Linux relays buffer the whole listing behind an identity
        // sandwich because Node cannot expose handle-relative scandir there.
        await verifyRelayCoworkingPath(target, 'directory')
      }
      return {
        entries: entries.slice(0, limit),
        nextOffset: entries.length > limit ? offset + limit : null
      }
    } finally {
      await directory.close().catch(() => {})
    }
  } finally {
    await handle.close()
  }
}

async function readCoworkingFileVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ contentBase64: string; totalBytes: number }> {
  requireOnlyKeys(params, ['target', 'offset', 'maxBytes'])
  const target = relayCoworkingExistingPathProof(params.target)
  const offset = relayCoworkingInteger(params.offset, 0, Number.MAX_SAFE_INTEGER)
  const maxBytes = relayCoworkingInteger(params.maxBytes, 1, COWORKING_FILE_READ_MAX_BYTES)
  relayCoworkingThrowIfAborted(context.signal)
  const { handle, stats } = await openRelayCoworkingVerifiedFile(target, constants.O_RDONLY)
  try {
    if (!Number.isSafeInteger(stats.size) || stats.size < 0) {
      throw new Error('coworking_verified_file_too_large')
    }
    if (offset > stats.size) {
      throw new Error('coworking_verified_parameter_invalid')
    }
    const length = Math.min(maxBytes, Math.max(0, stats.size - offset))
    const buffer = Buffer.alloc(length)
    let bytesRead = 0
    while (bytesRead < length) {
      relayCoworkingThrowIfAborted(context.signal)
      const result = await handle.read(buffer, bytesRead, length - bytesRead, offset + bytesRead)
      if (result.bytesRead === 0) {
        break
      }
      bytesRead += result.bytesRead
    }
    return {
      contentBase64: buffer.subarray(0, bytesRead).toString('base64'),
      totalBytes: stats.size
    }
  } finally {
    await handle.close()
  }
}

async function writeCoworkingFileVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  const mode = params.mode
  if (mode !== 'create' && mode !== 'replace') {
    throw new Error('coworking_verified_parameter_invalid')
  }
  const bytes = relayCoworkingBase64(params.contentBase64, COWORKING_FILE_WRITE_MAX_BYTES)
  const parent = relayCoworkingExistingPathProof(params.parent)
  if (mode === 'create') {
    requireOnlyKeys(params, ['mode', 'targetPath', 'parent', 'contentBase64'])
    const targetPath = relayCoworkingAbsolutePath(params.targetPath)
    requireDirectChild(targetPath, parent)
    await verifyCreateDestination(targetPath, parent, context.signal)
    const handle = await openRelayCoworkingExclusiveFile(targetPath)
    try {
      await writeRelayCoworkingFile(handle, bytes)
    } finally {
      await handle.close()
    }
    return { ok: true }
  }

  requireOnlyKeys(params, ['mode', 'target', 'parent', 'contentBase64'])
  const target = relayCoworkingExistingPathProof(params.target)
  requireDirectChild(target.path, parent)
  relayCoworkingThrowIfAborted(context.signal)
  await verifyRelayCoworkingPath(parent, 'directory')
  const { handle } = await openRelayCoworkingVerifiedFile(target, constants.O_WRONLY)
  try {
    relayCoworkingThrowIfAborted(context.signal)
    // Why: truncation only happens after fstat binds this handle to the granted file.
    await handle.truncate(0)
    await writeRelayCoworkingFile(handle, bytes)
  } finally {
    await handle.close()
  }
  return { ok: true }
}

async function createCoworkingDirectoryVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  requireOnlyKeys(params, ['targetPath', 'parent'])
  const targetPath = relayCoworkingAbsolutePath(params.targetPath)
  const parent = relayCoworkingExistingPathProof(params.parent)
  requireDirectChild(targetPath, parent)
  await verifyCreateDestination(targetPath, parent, context.signal)
  relayCoworkingThrowIfAborted(context.signal)
  await mkdir(targetPath, { recursive: false })
  return { ok: true }
}

async function renameCoworkingPathVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  requireOnlyKeys(params, ['source', 'sourceParent', 'destinationPath', 'destinationParent'])
  const source = relayCoworkingExistingPathProof(params.source)
  const sourceParent = relayCoworkingExistingPathProof(params.sourceParent)
  const destinationPath = relayCoworkingAbsolutePath(params.destinationPath)
  const destinationParent = relayCoworkingExistingPathProof(params.destinationParent)
  requireDirectChild(source.path, sourceParent)
  requireDirectChild(destinationPath, destinationParent)
  await verifyRenameInputs(source, sourceParent, destinationPath, destinationParent, context.signal)
  // Why: Node has no cross-platform rename-no-replace flag, so keep the
  // collision check on the relay immediately adjacent to the mutation.
  await assertNoClobberRenameDestinationAvailable(source.path, destinationPath)
  relayCoworkingThrowIfAborted(context.signal)
  await rename(source.path, destinationPath)
  return { ok: true }
}

async function deleteCoworkingPathVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  requireOnlyKeys(params, ['target', 'parent', 'recursive'])
  const target = relayCoworkingExistingPathProof(params.target)
  const parent = relayCoworkingExistingPathProof(params.parent)
  const recursive = relayCoworkingBoolean(params.recursive)
  requireDirectChild(target.path, parent)
  await verifyRelayCoworkingPath(parent, 'directory')
  const initialStats = await verifyRelayCoworkingPath(target)
  if (initialStats.isDirectory() && !recursive) {
    throw new Error('coworking_verified_recursive_required')
  }
  relayCoworkingThrowIfAborted(context.signal)
  await verifyRelayCoworkingPath(parent, 'directory')
  await verifyRelayCoworkingPath(target)
  relayCoworkingThrowIfAborted(context.signal)
  await rm(target.path, { recursive, force: false })
  return { ok: true }
}

async function verifyCreateDestination(
  targetPath: string,
  parent: RelayCoworkingExistingPathProof,
  signal: AbortSignal | undefined
): Promise<void> {
  await verifyRelayCoworkingPath(parent, 'directory')
  await assertRelayCoworkingPathMissing(targetPath)
  relayCoworkingThrowIfAborted(signal)
  // Why: recheck on the relay after admission because an owner-side path proof can age in transit.
  await verifyRelayCoworkingPath(parent, 'directory')
  await assertRelayCoworkingPathMissing(targetPath)
}

async function verifyRenameInputs(
  source: RelayCoworkingExistingPathProof,
  sourceParent: RelayCoworkingExistingPathProof,
  destinationPath: string,
  destinationParent: RelayCoworkingExistingPathProof,
  signal: AbortSignal | undefined
): Promise<void> {
  await Promise.all([
    verifyRelayCoworkingPath(source),
    verifyRelayCoworkingPath(sourceParent, 'directory'),
    verifyRelayCoworkingPath(destinationParent, 'directory'),
    assertRelayCoworkingPathMissing(destinationPath)
  ])
  relayCoworkingThrowIfAborted(signal)
  await Promise.all([
    verifyRelayCoworkingPath(source),
    verifyRelayCoworkingPath(sourceParent, 'directory'),
    verifyRelayCoworkingPath(destinationParent, 'directory')
  ])
  await assertRelayCoworkingPathMissing(destinationPath)
  relayCoworkingThrowIfAborted(signal)
}

function requireDirectChild(pathValue: string, parent: RelayCoworkingExistingPathProof): void {
  if (dirname(pathValue) !== parent.path || parent.path !== parent.expectedRealPath) {
    throw new Error('coworking_verified_path_stale')
  }
}

function requireOnlyKeys(params: Record<string, unknown>, keys: readonly string[]): void {
  if (!hasExactCoworkingWireKeys(params, keys)) {
    throw new Error('coworking_verified_parameter_invalid')
  }
}

function verifiedDirectoryDescriptorPath(fd: number): string {
  return join('/proc/self/fd', String(fd))
}
