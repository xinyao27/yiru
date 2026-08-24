import { lstat, open, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { isENOENT, resolveAuthorizedPath } from '../filesystem/auth'
import type { Store } from '../persistence'
import { MOBILE_FILE_READ_MAX_BYTES, MOBILE_BINARY_EXTENSIONS } from './runtime-file-foundation'

export function isSafeMobileRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(relativePath)) {
    return false
  }
  const parts = relativePath.replace(/\\/g, '/').split('/')
  return parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

export function isMobileMarkdownPath(relativePath: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(relativePath)
}

export function isMobileBinaryPath(relativePath: string): boolean {
  const basename = basenameFromRelativePath(relativePath)
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0) {
    return false
  }
  return MOBILE_BINARY_EXTENSIONS.has(basename.slice(dotIndex).toLowerCase())
}

export function basenameFromRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export async function isRuntimeDirectoryEntry(
  entry: { isDirectory(): boolean; isSymbolicLink(): boolean },
  _entryPath: string
): Promise<boolean> {
  // Why: runtime-backed file explorer listings are still passive UI reads.
  // Do not stat symlink targets here; explicit open/expand can resolve them.
  if (entry.isSymbolicLink()) {
    void _entryPath
    return false
  }
  if (entry.isDirectory()) {
    return true
  }
  return false
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 8192)
  for (let i = 0; i < len; i += 1) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
}

export async function assertRuntimePathDoesNotExist(targetPath: string): Promise<void> {
  try {
    await lstat(targetPath)
    throw new Error(
      `A file or folder named '${basename(targetPath)}' already exists in this location`
    )
  } catch (error) {
    if (!isENOENT(error)) {
      throw error
    }
  }
}

export function rethrowRuntimeFileCreateError(error: unknown, targetPath: string): never {
  const name = basename(targetPath)
  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      throw new Error(`A file or folder named '${name}' already exists in this location`)
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(`Permission denied: unable to create '${name}'`)
    }
  }
  throw error
}

export async function readLocalMobileFile(filePath: string, store: Store): Promise<string> {
  const authorizedPath = await resolveAuthorizedPath(filePath, store)
  const fileStat = await stat(authorizedPath)
  // Why: mobile file previews are read-only convenience views; cap the read so
  // opening a generated log or bundle cannot block the WebSocket like oversized scrollback.
  const readLimit = Math.min(fileStat.size, MOBILE_FILE_READ_MAX_BYTES + 1)
  const handle = await open(authorizedPath, 'r')
  try {
    const buffer = Buffer.alloc(readLimit)
    const { bytesRead } = await handle.read(buffer, 0, readLimit, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}
