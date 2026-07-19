import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

import { hasExactSpoolWireKeys } from '../shared/spool/spool-exact-wire-record'

const MAX_PATH_BYTES = 256 * 1_024
const MAX_IDENTITY_BYTES = 512
const OPEN_NOFOLLOW = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : null
const OPEN_DIRECTORY = typeof constants.O_DIRECTORY === 'number' ? constants.O_DIRECTORY : 0

export type RelaySpoolExistingPathProof = {
  path: string
  expectedRealPath: string
  expectedStatIdentity: string
}

export function relaySpoolExistingPathProof(value: unknown): RelaySpoolExistingPathProof {
  if (
    !isRecord(value) ||
    !hasExactSpoolWireKeys(value, ['path', 'expectedRealPath', 'expectedStatIdentity'])
  ) {
    throw new Error('spool_verified_parameter_invalid')
  }
  return {
    path: relaySpoolAbsolutePath(value.path),
    expectedRealPath: relaySpoolAbsolutePath(value.expectedRealPath),
    expectedStatIdentity: boundedString(value.expectedStatIdentity, MAX_IDENTITY_BYTES)
  }
}

export function relaySpoolAbsolutePath(value: unknown): string {
  const pathValue = boundedString(value, MAX_PATH_BYTES)
  if (!isAbsolute(pathValue)) {
    throw new Error('spool_verified_parameter_invalid')
  }
  return pathValue
}

export function relaySpoolInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error('spool_verified_parameter_invalid')
  }
  return value
}

export function relaySpoolBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('spool_verified_parameter_invalid')
  }
  return value
}

export function relaySpoolBase64(value: unknown, maxBytes: number): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4) {
    throw new Error('spool_verified_parameter_invalid')
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.byteLength > maxBytes || decoded.toString('base64') !== value) {
    throw new Error('spool_verified_parameter_invalid')
  }
  return decoded
}

export async function openRelaySpoolVerifiedFile(
  proof: RelaySpoolExistingPathProof,
  flags: number
): Promise<{ handle: FileHandle; stats: Stats }> {
  await requireRelaySpoolRealPath(proof)
  const before = await lstat(proof.path)
  if (before.isSymbolicLink()) {
    throw new Error('spool_verified_path_stale')
  }
  let handle: FileHandle
  try {
    // Why: on hosts without O_NOFOLLOW, realpath plus exact handle identity
    // still binds reads and writes to the object that was originally granted.
    handle = await open(proof.path, flags | (OPEN_NOFOLLOW ?? 0))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('spool_verified_path_stale')
    }
    throw error
  }
  try {
    const stats = await handle.stat()
    requireRelaySpoolStats(stats, proof.expectedStatIdentity, 'file')
    await requireRelaySpoolRealPath(proof)
    return { handle, stats }
  } catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}

export async function openRelaySpoolVerifiedDirectory(
  proof: RelaySpoolExistingPathProof
): Promise<{ handle: FileHandle }> {
  await requireRelaySpoolRealPath(proof)
  let handle: FileHandle
  try {
    handle = await open(proof.path, constants.O_RDONLY | OPEN_DIRECTORY | (OPEN_NOFOLLOW ?? 0))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('spool_verified_path_stale')
    }
    throw error
  }
  try {
    requireRelaySpoolStats(await handle.stat(), proof.expectedStatIdentity, 'directory')
    await requireRelaySpoolRealPath(proof)
    return { handle }
  } catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}

export async function openRelaySpoolExclusiveFile(
  pathValue: string,
  mode = 0o666
): Promise<FileHandle> {
  let handle: FileHandle | null = null
  try {
    handle = await open(
      pathValue,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (OPEN_NOFOLLOW ?? 0),
      mode
    )
    const stats = await handle.stat()
    if (!stats.isFile()) {
      throw new Error('spool_verified_path_stale')
    }
    return handle
  } catch (error) {
    await handle?.close().catch(() => {})
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('spool_verified_path_stale')
    }
    throw error
  }
}

export async function verifyRelaySpoolPath(
  proof: RelaySpoolExistingPathProof,
  expectedType?: 'file' | 'directory'
): Promise<Stats> {
  await requireRelaySpoolRealPath(proof)
  const stats = await lstat(proof.path)
  if (stats.isSymbolicLink()) {
    throw new Error('spool_verified_path_stale')
  }
  requireRelaySpoolStats(stats, proof.expectedStatIdentity, expectedType)
  await requireRelaySpoolRealPath(proof)
  return stats
}

export async function requireRelaySpoolRealPath(
  proof: Pick<RelaySpoolExistingPathProof, 'path' | 'expectedRealPath'>
): Promise<void> {
  if ((await realpath(proof.path)) !== proof.expectedRealPath) {
    throw new Error('spool_verified_path_stale')
  }
}

export async function assertRelaySpoolPathMissing(pathValue: string): Promise<void> {
  try {
    await lstat(pathValue)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error('spool_verified_destination_exists')
}

export async function writeRelaySpoolFile(handle: FileHandle, bytes: Buffer): Promise<void> {
  let offset = 0
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset)
    if (bytesWritten <= 0) {
      throw new Error('spool_verified_write_incomplete')
    }
    offset += bytesWritten
  }
}

export function relaySpoolThrowIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted()
}

export function requireRelaySpoolStats(
  stats: Stats,
  expectedIdentity: string,
  expectedType?: 'file' | 'directory'
): void {
  const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other'
  if (
    (expectedType && type !== expectedType) ||
    type === 'other' ||
    relaySpoolStatIdentity(stats, type) !== expectedIdentity
  ) {
    throw new Error('spool_verified_path_stale')
  }
}

function relaySpoolStatIdentity(stats: Stats, type: 'file' | 'directory' | 'other'): string {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}:${type}`
}

function boundedString(value: unknown, maxBytes: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    Buffer.byteLength(value, 'utf8') > maxBytes
  ) {
    throw new Error('spool_verified_parameter_invalid')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
