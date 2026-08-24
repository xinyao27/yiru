import { lstat, open, readFile, stat, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { localLogFileIdentity } from '../ai-vault/local-log-tail-reader'
import type { Store } from '../persistence'
import { tryDeleteWslUncPath } from '../wsl-unc-delete'
import { resolveAuthorizedPath, isENOENT, authorizeExternalPath } from './auth'
import { createDownloadedFolderSessionService } from './downloaded-folder-sessions'
import { createFileDownloadService } from './file-download-service'
import { initializeLocalLogTailAuthorization } from './local-log-tail'
import { createFilesystemMutationService } from './mutations'
import type { NativePathServices } from './native-path-services'

// Why: Monaco has large-file optimizations like VS Code; blocking at 5MB makes
// ordinary JSON/log files inaccessible before the editor can degrade features.
const MAX_TEXT_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const BINARY_PROBE_BYTES = 8192
const FILE_READ_CHUNK_MAX_BYTES = 512 * 1024
// Why: previewable binaries (PDFs, images) are rendered by the viewer as
// base64 blobs, not parsed as text — 5MB is tight for real-world PDFs, and
// raising this cap only affects binary preview, not text/search paths.
// The relay runtime uses a smaller 10MB cap because its JSON-RPC frames are
// bounded by MAX_MESSAGE_SIZE = 16MB; the local IPC path has no such limit,
// so 50MB covers real-world PDFs (specs, datasheets, image-heavy contracts).
// See the relay's text-search fs handler for the remote-side reasoning.
const MAX_PREVIEWABLE_BINARY_SIZE = 50 * 1024 * 1024 // 50MB
const PREVIEWABLE_BINARY_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
}

async function readLocalLogSnapshot(filePath: string): Promise<{
  content: string
  isBinary: boolean
  fileIdentity?: string
}> {
  const handle = await open(filePath, 'r')
  try {
    const stats = await handle.stat()
    if (stats.size > MAX_TEXT_FILE_SIZE) {
      throw new Error(
        `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_TEXT_FILE_SIZE / 1024 / 1024}MB limit`
      )
    }
    const buffer = await handle.readFile()
    if (buffer.byteLength > MAX_TEXT_FILE_SIZE) {
      throw new Error(
        `File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_TEXT_FILE_SIZE / 1024 / 1024}MB limit`
      )
    }
    if (isBinaryBuffer(buffer)) {
      return { content: '', isBinary: true }
    }
    return {
      content: buffer.toString('utf8'),
      isBinary: false,
      fileIdentity: localLogFileIdentity(stats)
    }
  } finally {
    await handle.close()
  }
}

/**
 * Check if a buffer appears to be binary (contains null bytes in first 8KB).
 */
function isBinaryBuffer(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 8192)
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
}

async function isBinaryFilePrefix(filePath: string): Promise<boolean> {
  const handle = await open(filePath, 'r')
  try {
    const probe = Buffer.alloc(BINARY_PROBE_BYTES)
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0)
    return isBinaryBuffer(probe.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export function createFilesystemService(store: Store, nativePathServices: NativePathServices) {
  const fileDownloads = createFileDownloadService(nativePathServices)
  const folderDownloads = createDownloadedFolderSessionService(nativePathServices)
  const mutations = createFilesystemMutationService(store)

  initializeLocalLogTailAuthorization(store)

  return {
    read: async (args: {
      filePath: string
      includeLocalLogMetadata?: boolean
    }): Promise<{
      content: string
      isBinary: boolean
      isImage?: boolean
      mimeType?: string
      fileIdentity?: string
    }> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      if (args.includeLocalLogMetadata === true) {
        return readLocalLogSnapshot(filePath)
      }
      const stats = await stat(filePath)
      const mimeType = PREVIEWABLE_BINARY_MIME_TYPES[extname(filePath).toLowerCase()]
      const sizeLimit = mimeType ? MAX_PREVIEWABLE_BINARY_SIZE : MAX_TEXT_FILE_SIZE
      if (stats.size > sizeLimit) {
        throw new Error(
          `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds ${sizeLimit / 1024 / 1024}MB limit`
        )
      }

      if (mimeType) {
        const buffer = await readFile(filePath)
        return {
          content: buffer.toString('base64'),
          isBinary: true,
          // Why: the renderer/store contract already keys previewable binary
          // rendering off `isImage`. Keep that legacy flag for PDFs too so the
          // new preview path stays compatible with existing callers.
          isImage: true,
          mimeType
        }
      }

      // Why: the text cap is intentionally larger than the old binary cap.
      // Probe unknown large files first so archives do not get fully buffered
      // just to discover they are not editable text.
      if (stats.size > BINARY_PROBE_BYTES && (await isBinaryFilePrefix(filePath))) {
        return { content: '', isBinary: true }
      }

      const buffer = await readFile(filePath)
      if (isBinaryBuffer(buffer)) {
        return { content: '', isBinary: true }
      }

      return { content: buffer.toString('utf-8'), isBinary: false }
    },

    readChunk: async (args: {
      filePath: string
      offset: number
      length: number
    }): Promise<{
      contentBase64: string
      bytesRead: number
      eof: boolean
    }> => {
      if (
        !Number.isSafeInteger(args.offset) ||
        args.offset < 0 ||
        !Number.isSafeInteger(args.length) ||
        args.length <= 0 ||
        args.length > FILE_READ_CHUNK_MAX_BYTES
      ) {
        throw new Error('Invalid file read range')
      }
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      const handle = await open(filePath, 'r')
      try {
        const stats = await handle.stat()
        if (stats.isDirectory()) {
          throw new Error('Cannot read a directory')
        }
        const buffer = Buffer.alloc(Math.min(args.length, Math.max(0, stats.size - args.offset)))
        const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, args.offset)
        return {
          contentBase64: buffer.subarray(0, bytesRead).toString('base64'),
          bytesRead,
          eof: args.offset + bytesRead >= stats.size
        }
      } finally {
        await handle.close()
      }
    },

    write: async (args: { filePath: string; content: string }): Promise<void> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)

      try {
        const fileStats = await lstat(filePath)
        if (fileStats.isDirectory()) {
          throw new Error('Cannot write to a directory')
        }
      } catch (error) {
        if (!isENOENT(error)) {
          throw error
        }
      }

      await writeFile(filePath, args.content, 'utf-8')
    },

    delete: async (args: { targetPath: string; recursive?: boolean }): Promise<void> => {
      // Why: deleting must operate on the symlink itself, not its target.
      // Following the link with realpath() would trash the real file — which
      // could be another file inside the worktree, or a path outside all
      // allowed roots that we would never be able to delete again.
      const targetPath = await resolveAuthorizedPath(args.targetPath, store, {
        preserveSymlink: true
      })

      // Why: WSL UNC targets (\\wsl.localhost\<distro>\...) have no Recycle Bin,
      // so shell.trashItem throws. Hard-delete via `rm` inside the distro instead
      // (true delete, honors Linux perms). Returns false for normal local paths,
      // which still go to the Recycle Bin (issue #6415).
      if (await tryDeleteWslUncPath(targetPath, { recursive: args.recursive })) {
        return
      }

      // Why: once auto-refresh exists, an external delete can race with a
      // UI-initiated delete. Swallowing ENOENT keeps the action idempotent
      // from the user's perspective (design §7.1).
      try {
        await nativePathServices.trashPath(targetPath)
      } catch (error) {
        if (isENOENT(error)) {
          return
        }
        throw error
      }
    },

    authorizeExternalPath: (args: { targetPath: string }): void => {
      authorizeExternalPath(args.targetPath)
    },

    stat: async (args: {
      filePath: string
    }): Promise<{ size: number; isDirectory: boolean; mtime: number }> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      const stats = await stat(filePath)
      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        mtime: stats.mtimeMs
      }
    },

    pathExists: async (args: { filePath: string }): Promise<boolean> => {
      try {
        const filePath = await resolveAuthorizedPath(args.filePath, store)
        await stat(filePath)
        return true
      } catch (error) {
        if (isENOENT(error)) {
          return false
        }
        throw error
      }
    },
    ...fileDownloads,
    ...folderDownloads,
    ...mutations
  }
}
