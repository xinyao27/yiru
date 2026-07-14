import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { mkdir, opendir, rename, rm } from 'node:fs/promises'
import {
  SPOOL_FILE_READ_MAX_BYTES,
  SPOOL_FILE_WRITE_MAX_BYTES
} from '../shared/spool/spool-operation-contract'
import { assertNoClobberRenameDestinationAvailable } from '../shared/filesystem-rename-collision'
import type { RelayDispatcher, RequestContext } from './dispatcher'
import {
  assertRelaySpoolPathMissing,
  openRelaySpoolExclusiveFile,
  openRelaySpoolVerifiedDirectory,
  openRelaySpoolVerifiedFile,
  relaySpoolAbsolutePath,
  relaySpoolBase64,
  relaySpoolBoolean,
  relaySpoolExistingPathProof,
  relaySpoolInteger,
  relaySpoolThrowIfAborted,
  requireRelaySpoolStats,
  verifyRelaySpoolPath,
  writeRelaySpoolFile,
  type RelaySpoolExistingPathProof
} from './fs-handler-spool-path-proof'

export function registerSpoolVerifiedFilesystemHandlers(dispatcher: RelayDispatcher): void {
  dispatcher.onRequest('fs.spoolListVerified', listSpoolDirectoryVerified)
  dispatcher.onRequest('fs.spoolReadVerified', readSpoolFileVerified)
  dispatcher.onRequest('fs.spoolWriteVerified', writeSpoolFileVerified)
  dispatcher.onRequest('fs.spoolCreateDirectoryVerified', createSpoolDirectoryVerified)
  dispatcher.onRequest('fs.spoolRenameVerified', renameSpoolPathVerified)
  dispatcher.onRequest('fs.spoolDeleteVerified', deleteSpoolPathVerified)
}

async function listSpoolDirectoryVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<readonly { name: string; kind: 'file' | 'directory' | 'symlink' }[]> {
  requireOnlyKeys(params, ['target', 'limit'])
  const target = relaySpoolExistingPathProof(params.target)
  const limit = relaySpoolInteger(params.limit, 1, 5_001)
  relaySpoolThrowIfAborted(context.signal)
  const { handle } = await openRelaySpoolVerifiedDirectory(target)
  try {
    const descriptorBound = process.platform === 'linux'
    if (!descriptorBound) {
      await verifyRelaySpoolPath(target, 'directory')
    }
    const directory = await opendir(
      descriptorBound ? verifiedDirectoryDescriptorPath(handle.fd) : target.path
    )
    try {
      if (!descriptorBound) {
        await verifyRelaySpoolPath(target, 'directory')
      }
      const entries: { name: string; kind: 'file' | 'directory' | 'symlink' }[] = []
      for await (const entry of directory) {
        relaySpoolThrowIfAborted(context.signal)
        entries.push({
          name: entry.name,
          kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : 'file'
        })
        if (entries.length >= limit) {
          break
        }
      }
      requireRelaySpoolStats(await handle.stat(), target.expectedStatIdentity, 'directory')
      if (!descriptorBound) {
        // Why: non-Linux relays buffer the whole listing behind an identity
        // sandwich because Node cannot expose handle-relative scandir there.
        await verifyRelaySpoolPath(target, 'directory')
      }
      return entries
    } finally {
      await directory.close().catch(() => {})
    }
  } finally {
    await handle.close()
  }
}

async function readSpoolFileVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ contentBase64: string; totalBytes: number }> {
  requireOnlyKeys(params, ['target', 'offset', 'maxBytes'])
  const target = relaySpoolExistingPathProof(params.target)
  const offset = relaySpoolInteger(params.offset, 0, Number.MAX_SAFE_INTEGER)
  const maxBytes = relaySpoolInteger(params.maxBytes, 1, SPOOL_FILE_READ_MAX_BYTES)
  relaySpoolThrowIfAborted(context.signal)
  const { handle, stats } = await openRelaySpoolVerifiedFile(target, constants.O_RDONLY)
  try {
    if (!Number.isSafeInteger(stats.size) || stats.size < 0) {
      throw new Error('spool_verified_file_too_large')
    }
    if (offset > stats.size) {
      throw new Error('spool_verified_parameter_invalid')
    }
    const length = Math.min(maxBytes, Math.max(0, stats.size - offset))
    const buffer = Buffer.alloc(length)
    let bytesRead = 0
    while (bytesRead < length) {
      relaySpoolThrowIfAborted(context.signal)
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

async function writeSpoolFileVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  const mode = params.mode
  if (mode !== 'create' && mode !== 'replace') {
    throw new Error('spool_verified_parameter_invalid')
  }
  const bytes = relaySpoolBase64(params.contentBase64, SPOOL_FILE_WRITE_MAX_BYTES)
  const parent = relaySpoolExistingPathProof(params.parent)
  if (mode === 'create') {
    requireOnlyKeys(params, ['mode', 'targetPath', 'parent', 'contentBase64'])
    const targetPath = relaySpoolAbsolutePath(params.targetPath)
    requireDirectChild(targetPath, parent)
    await verifyCreateDestination(targetPath, parent, context.signal)
    const handle = await openRelaySpoolExclusiveFile(targetPath)
    try {
      await writeRelaySpoolFile(handle, bytes)
    } finally {
      await handle.close()
    }
    return { ok: true }
  }

  requireOnlyKeys(params, ['mode', 'target', 'parent', 'contentBase64'])
  const target = relaySpoolExistingPathProof(params.target)
  requireDirectChild(target.path, parent)
  relaySpoolThrowIfAborted(context.signal)
  await verifyRelaySpoolPath(parent, 'directory')
  const { handle } = await openRelaySpoolVerifiedFile(target, constants.O_WRONLY)
  try {
    relaySpoolThrowIfAborted(context.signal)
    // Why: truncation only happens after fstat binds this handle to the granted file.
    await handle.truncate(0)
    await writeRelaySpoolFile(handle, bytes)
  } finally {
    await handle.close()
  }
  return { ok: true }
}

async function createSpoolDirectoryVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  requireOnlyKeys(params, ['targetPath', 'parent'])
  const targetPath = relaySpoolAbsolutePath(params.targetPath)
  const parent = relaySpoolExistingPathProof(params.parent)
  requireDirectChild(targetPath, parent)
  await verifyCreateDestination(targetPath, parent, context.signal)
  relaySpoolThrowIfAborted(context.signal)
  await mkdir(targetPath, { recursive: false })
  return { ok: true }
}

async function renameSpoolPathVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  requireOnlyKeys(params, ['source', 'sourceParent', 'destinationPath', 'destinationParent'])
  const source = relaySpoolExistingPathProof(params.source)
  const sourceParent = relaySpoolExistingPathProof(params.sourceParent)
  const destinationPath = relaySpoolAbsolutePath(params.destinationPath)
  const destinationParent = relaySpoolExistingPathProof(params.destinationParent)
  requireDirectChild(source.path, sourceParent)
  requireDirectChild(destinationPath, destinationParent)
  await verifyRenameInputs(source, sourceParent, destinationPath, destinationParent, context.signal)
  // Why: Node has no cross-platform rename-no-replace flag, so keep the
  // collision check on the relay immediately adjacent to the mutation.
  await assertNoClobberRenameDestinationAvailable(source.path, destinationPath)
  relaySpoolThrowIfAborted(context.signal)
  await rename(source.path, destinationPath)
  return { ok: true }
}

async function deleteSpoolPathVerified(
  params: Record<string, unknown>,
  context: RequestContext
): Promise<{ ok: true }> {
  requireOnlyKeys(params, ['target', 'parent', 'recursive'])
  const target = relaySpoolExistingPathProof(params.target)
  const parent = relaySpoolExistingPathProof(params.parent)
  const recursive = relaySpoolBoolean(params.recursive)
  requireDirectChild(target.path, parent)
  await verifyRelaySpoolPath(parent, 'directory')
  const initialStats = await verifyRelaySpoolPath(target)
  if (initialStats.isDirectory() && !recursive) {
    throw new Error('spool_verified_recursive_required')
  }
  relaySpoolThrowIfAborted(context.signal)
  await verifyRelaySpoolPath(parent, 'directory')
  await verifyRelaySpoolPath(target)
  relaySpoolThrowIfAborted(context.signal)
  await rm(target.path, { recursive, force: false })
  return { ok: true }
}

async function verifyCreateDestination(
  targetPath: string,
  parent: RelaySpoolExistingPathProof,
  signal: AbortSignal | undefined
): Promise<void> {
  await verifyRelaySpoolPath(parent, 'directory')
  await assertRelaySpoolPathMissing(targetPath)
  relaySpoolThrowIfAborted(signal)
  // Why: recheck on the relay after admission because an owner-side path proof can age in transit.
  await verifyRelaySpoolPath(parent, 'directory')
  await assertRelaySpoolPathMissing(targetPath)
}

async function verifyRenameInputs(
  source: RelaySpoolExistingPathProof,
  sourceParent: RelaySpoolExistingPathProof,
  destinationPath: string,
  destinationParent: RelaySpoolExistingPathProof,
  signal: AbortSignal | undefined
): Promise<void> {
  await Promise.all([
    verifyRelaySpoolPath(source),
    verifyRelaySpoolPath(sourceParent, 'directory'),
    verifyRelaySpoolPath(destinationParent, 'directory'),
    assertRelaySpoolPathMissing(destinationPath)
  ])
  relaySpoolThrowIfAborted(signal)
  await Promise.all([
    verifyRelaySpoolPath(source),
    verifyRelaySpoolPath(sourceParent, 'directory'),
    verifyRelaySpoolPath(destinationParent, 'directory')
  ])
  await assertRelaySpoolPathMissing(destinationPath)
  relaySpoolThrowIfAborted(signal)
}

function requireDirectChild(pathValue: string, parent: RelaySpoolExistingPathProof): void {
  if (dirname(pathValue) !== parent.path || parent.path !== parent.expectedRealPath) {
    throw new Error('spool_verified_path_stale')
  }
}

function requireOnlyKeys(params: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys)
  if (
    Object.keys(params).length !== keys.length ||
    Object.keys(params).some((key) => !allowed.has(key))
  ) {
    throw new Error('spool_verified_parameter_invalid')
  }
}

function verifiedDirectoryDescriptorPath(fd: number): string {
  return join('/proc/self/fd', String(fd))
}
