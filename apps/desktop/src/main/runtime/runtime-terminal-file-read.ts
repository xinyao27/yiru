import type { FileHandle } from 'node:fs/promises'
import { open } from 'node:fs/promises'
import { extname } from 'node:path'

import { isRuntimePathAbsolute, resolveRuntimePath } from '@yiru/workbench-model/platform'
import type { RuntimeFilePreviewResult } from '~shared/runtime-types'

import { parseWslPath, toWindowsWslPath } from '../wsl'
import type { TerminalFileGrant } from './runtime-file-foundation'
import {
  MOBILE_FILE_READ_MAX_BYTES,
  RUNTIME_PREVIEWABLE_BINARY_MAX_BYTES,
  OPEN_NOFOLLOW,
  RUNTIME_PREVIEWABLE_BINARY_MIME_TYPES
} from './runtime-file-foundation'
import { isBinaryBuffer } from './runtime-file-paths'
import {
  readFileHandleBufferBounded,
  assertTerminalFileGrantFresh
} from './runtime-terminal-file-security'
import {
  normalizeTerminalFileUriAuthorityPath,
  canonicalPathForArtifactComparison
} from './runtime-terminal-path'

export async function readLocalTerminalArtifactFileFromHandle(
  handle: FileHandle,
  grant: TerminalFileGrant
): Promise<string> {
  const fileStat = await handle.stat()
  if (fileStat.isDirectory()) {
    throw new Error('Cannot read a directory')
  }
  if (fileStat.size > MOBILE_FILE_READ_MAX_BYTES) {
    throw new Error('file_too_large')
  }
  assertTerminalFileGrantFresh(grant, fileStat)
  const buffer = await readFileHandleBufferBounded(handle, MOBILE_FILE_READ_MAX_BYTES + 1)
  if (isBinaryBuffer(buffer)) {
    throw new Error('binary_file')
  }
  return buffer.toString('utf8')
}

export async function readLocalTerminalArtifactPreviewFromHandle(
  handle: FileHandle,
  grant: TerminalFileGrant
): Promise<RuntimeFilePreviewResult> {
  const fileStats = await handle.stat()
  if (fileStats.isDirectory()) {
    throw new Error('Cannot preview a directory')
  }
  assertTerminalFileGrantFresh(grant, fileStats)
  const mimeType = RUNTIME_PREVIEWABLE_BINARY_MIME_TYPES[extname(grant.absolutePath).toLowerCase()]
  if (mimeType) {
    if (fileStats.size > RUNTIME_PREVIEWABLE_BINARY_MAX_BYTES) {
      throw new Error('file_too_large')
    }
    const buffer = await readFileHandleBufferBounded(
      handle,
      RUNTIME_PREVIEWABLE_BINARY_MAX_BYTES + 1
    )
    return {
      content: buffer.toString('base64'),
      isBinary: true,
      isImage: true,
      mimeType
    }
  }

  const content = await readLocalTerminalArtifactFileFromHandle(handle, grant)
  return { content, isBinary: false }
}

export async function assertLocalTerminalArtifactPathStillCanonical(
  filePath: string
): Promise<void> {
  const currentPath = await canonicalPathForArtifactComparison(filePath)
  if (currentPath !== filePath) {
    throw new Error('terminal_file_grant_stale')
  }
}

export async function openLocalTerminalArtifactGrant(
  grant: TerminalFileGrant,
  flags: number
): Promise<FileHandle> {
  await assertLocalTerminalArtifactPathStillCanonical(grant.absolutePath)
  try {
    return await open(grant.absolutePath, flags | OPEN_NOFOLLOW)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('terminal_file_grant_stale')
    }
    throw error
  }
}

export function resolveTerminalAbsolutePath(args: {
  base: string
  expanded: string
  worktreePath: string
}): string {
  const expanded = normalizeTerminalFileUriAuthorityPath(args.expanded, args.worktreePath)
  const absolutePath = isRuntimePathAbsolute(expanded)
    ? expanded
    : resolveRuntimePath(args.base, expanded)
  const wsl = parseWslPath(args.worktreePath)
  if (wsl && absolutePath.startsWith('/') && !absolutePath.startsWith('//')) {
    return toWindowsWslPath(absolutePath, wsl.distro)
  }
  return absolutePath
}
