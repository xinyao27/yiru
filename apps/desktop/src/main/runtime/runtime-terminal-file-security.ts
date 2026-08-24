import type { FileHandle } from 'node:fs/promises'

import type { RuntimeFileStatLike, TerminalFileGrant } from './runtime-file-foundation'
import { MOBILE_FILE_READ_MAX_BYTES } from './runtime-file-foundation'

export async function readFileHandleBufferBounded(
  handle: FileHandle,
  limit: number
): Promise<Buffer> {
  const buffer = Buffer.alloc(limit)
  const { bytesRead } = await handle.read(buffer, 0, limit, 0)
  return buffer.subarray(0, bytesRead)
}

export function terminalFileStatIdentity(stats: RuntimeFileStatLike): string | null {
  const dev = typeof stats.dev === 'number' ? stats.dev : null
  const ino = typeof stats.ino === 'number' ? stats.ino : null
  const nlink = typeof stats.nlink === 'number' ? stats.nlink : null
  const size = typeof stats.size === 'number' ? stats.size : null
  const mtimeMs =
    typeof stats.mtimeMs === 'number'
      ? stats.mtimeMs
      : typeof stats.mtime === 'number'
        ? stats.mtime
        : null
  if (dev !== null && ino !== null && size !== null && mtimeMs !== null) {
    return `${dev}:${ino}:${nlink ?? 'unknown'}:${size}:${mtimeMs}`
  }
  if (size !== null && mtimeMs !== null) {
    return `${size}:${mtimeMs}`
  }
  return null
}

export function assertTerminalFileGrantFresh(
  grant: TerminalFileGrant,
  stats: RuntimeFileStatLike
): void {
  assertTerminalArtifactNotHardLinked(stats)
  const nextIdentity = terminalFileStatIdentity(stats)
  if (grant.statIdentity !== null && nextIdentity !== null && grant.statIdentity !== nextIdentity) {
    throw new Error('terminal_file_grant_stale')
  }
}

export function assertTerminalArtifactNotHardLinked(stats: RuntimeFileStatLike): void {
  if (isTerminalArtifactHardLinked(stats)) {
    throw new Error('terminal_file_grant_stale')
  }
}

export function isTerminalArtifactHardLinked(stats: RuntimeFileStatLike): boolean {
  return typeof stats.nlink === 'number' && stats.nlink > 1
}

export function truncateMobileFilePreview(content: string): {
  content: string
  truncated: boolean
  byteLength: number
} {
  const buffer = Buffer.from(content, 'utf8')
  if (buffer.byteLength <= MOBILE_FILE_READ_MAX_BYTES) {
    return { content, truncated: false, byteLength: buffer.byteLength }
  }
  return {
    content: buffer.subarray(0, MOBILE_FILE_READ_MAX_BYTES).toString('utf8'),
    truncated: true,
    byteLength: buffer.byteLength
  }
}
