import { randomUUID } from 'node:crypto'
import { readFile, writeFile, stat, lstat, open, rename, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
/* eslint-disable max-lines */

import { localLogFileIdentity } from '../ai-vault/local-log-tail-reader'
import type { MainIpcRegistration } from '../ipc-registration'
import { sanitizeLocalDownloadFilename } from '../local-download-filename'
import type { Store } from '../persistence'
import { tryDeleteWslUncPath } from '../wsl-unc-delete'
import { resolveAuthorizedPath, isENOENT, authorizeExternalPath } from './auth'
import { registerDownloadedFolderSessionHandlers } from './downloaded-folder-sessions'
import { initializeLocalLogTailAuthorization } from './local-log-tail'
import { registerFilesystemMutationHandlers } from './mutations'
import type { NativePathServices } from './native-path-services'

// Why: Monaco has large-file optimizations like VS Code; blocking at 5MB makes
// ordinary JSON/log files inaccessible before the editor can degrade features.
const MAX_TEXT_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const BINARY_PROBE_BYTES = 8192
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

type DownloadFileResult = { canceled: true } | { canceled: false; destinationPath: string }

function validateRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`)
  }
  return value
}

function decodeDownloadedFileContent(content: string, encoding: 'utf8' | 'base64'): Buffer {
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64')
  }
  return Buffer.from(content, 'utf8')
}

type DownloadSession = {
  destinationPath: string
  tempPath: string
  destinationExisted: boolean
  handle: FileHandle
  cleanupTimer: ReturnType<typeof setTimeout>
  senderId: number
}

const DOWNLOAD_SESSION_TTL_MS = 30 * 60 * 1000

function createSiblingTransferPath(destinationPath: string, suffix: string): string {
  return join(dirname(destinationPath), `.${randomUUID()}.${suffix}`)
}

async function cleanupLocalTransferPath(filePath: string | null): Promise<void> {
  if (!filePath) {
    return
  }
  await rm(filePath, { force: true }).catch(() => {})
}

async function inspectDownloadDestination(destinationPath: string): Promise<{ existed: boolean }> {
  try {
    const destinationStat = await stat(destinationPath)
    if (destinationStat.isDirectory()) {
      throw new Error('Cannot download to a directory')
    }
    return { existed: true }
  } catch (error) {
    if (isENOENT(error)) {
      return { existed: false }
    }
    throw error
  }
}

async function assertDestinationStillUnclaimed(destinationPath: string): Promise<void> {
  try {
    await stat(destinationPath)
  } catch (error) {
    if (isENOENT(error)) {
      return
    }
    throw error
  }
  throw new Error('Destination file appeared before download completed')
}

async function promoteDownloadedFile(
  tempPath: string,
  destinationPath: string,
  destinationExisted: boolean
): Promise<void> {
  if (!destinationExisted) {
    await assertDestinationStillUnclaimed(destinationPath)
    await rename(tempPath, destinationPath)
    return
  }

  const backupPath = createSiblingTransferPath(destinationPath, 'backup')
  let backupCreated = false
  try {
    await rename(destinationPath, backupPath)
    backupCreated = true
    await rename(tempPath, destinationPath)
    await cleanupLocalTransferPath(backupPath)
  } catch (error) {
    if (backupCreated) {
      await rename(backupPath, destinationPath).catch(() => {})
    }
    throw error
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

export function registerFilesystemHandlers(
  ipcMain: MainIpcRegistration,
  store: Store,
  nativePathServices: NativePathServices
): void {
  const downloadSessions = new Map<string, DownloadSession>()

  async function closeDownloadSession(
    transferId: string,
    cleanupTemp: boolean
  ): Promise<DownloadSession | null> {
    const session = downloadSessions.get(transferId)
    if (!session) {
      return null
    }
    downloadSessions.delete(transferId)
    clearTimeout(session.cleanupTimer)
    await session.handle.close().catch(() => {})
    if (cleanupTemp) {
      await cleanupLocalTransferPath(session.tempPath)
    }
    return session
  }

  function cleanupDownloadSessionsForSender(senderId: number): void {
    for (const [transferId, session] of Array.from(downloadSessions)) {
      if (session.senderId === senderId) {
        void closeDownloadSession(transferId, true)
      }
    }
  }

  // ─── Filesystem ─────────────────────────────────────────
  ipcMain.handle(
    'file-host:readFile',
    async (
      _event,
      args: { filePath: string; connectionId?: string; includeLocalLogMetadata?: boolean }
    ): Promise<{
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
    }
  )

  registerDownloadedFolderSessionHandlers(ipcMain, nativePathServices)

  ipcMain.handle(
    'file-host:saveDownloadedFile',
    async (
      event,
      args: { suggestedName?: string; content?: string; encoding?: 'utf8' | 'base64' }
    ): Promise<DownloadFileResult> => {
      const suggestedName = sanitizeLocalDownloadFilename(
        validateRequiredString(args?.suggestedName, 'suggestedName')
      )
      if (typeof args?.content !== 'string') {
        throw new Error('content is required')
      }
      const content = args.content
      const encoding = args?.encoding === 'base64' ? 'base64' : 'utf8'
      const destinationPath = await nativePathServices.chooseDownloadFile(
        event.sender.id,
        suggestedName
      )
      if (!destinationPath) {
        return { canceled: true }
      }
      const { existed } = await inspectDownloadDestination(destinationPath)
      const tempPath = createSiblingTransferPath(destinationPath, 'download')
      let promoted = false
      try {
        await writeFile(tempPath, decodeDownloadedFileContent(content, encoding))
        await promoteDownloadedFile(tempPath, destinationPath, existed)
        promoted = true
        return { canceled: false, destinationPath }
      } finally {
        if (!promoted) {
          await cleanupLocalTransferPath(tempPath)
        }
      }
    }
  )

  ipcMain.handle(
    'file-host:startDownloadedFile',
    async (
      event,
      args: { suggestedName?: string }
    ): Promise<
      | { canceled: true }
      | {
          canceled: false
          transferId: string
          destinationPath: string
        }
    > => {
      const suggestedName = sanitizeLocalDownloadFilename(
        validateRequiredString(args?.suggestedName, 'suggestedName')
      )
      const destinationPath = await nativePathServices.chooseDownloadFile(
        event.sender.id,
        suggestedName
      )
      if (!destinationPath) {
        return { canceled: true }
      }
      const { existed } = await inspectDownloadDestination(destinationPath)
      const tempPath = createSiblingTransferPath(destinationPath, 'download')
      const transferId = randomUUID()
      try {
        const handle = await open(tempPath, 'wx')
        const senderId = typeof event.sender.id === 'number' ? event.sender.id : Number.NaN
        const cleanupTimer = setTimeout(() => {
          void closeDownloadSession(transferId, true)
        }, DOWNLOAD_SESSION_TTL_MS)
        if (typeof cleanupTimer.unref === 'function') {
          cleanupTimer.unref()
        }
        downloadSessions.set(transferId, {
          destinationPath,
          tempPath,
          destinationExisted: existed,
          handle,
          cleanupTimer,
          senderId
        })
        event.sender.once?.('destroyed', () => cleanupDownloadSessionsForSender(senderId))
        return { canceled: false, transferId, destinationPath }
      } catch (error) {
        await cleanupLocalTransferPath(tempPath)
        throw error
      }
    }
  )

  ipcMain.handle(
    'file-host:appendDownloadedFileChunk',
    async (
      _event,
      args: { transferId?: string; contentBase64?: string }
    ): Promise<{ ok: true }> => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      const contentBase64 = validateRequiredString(args?.contentBase64, 'contentBase64')
      const session = downloadSessions.get(transferId)
      if (!session) {
        throw new Error('Download session not found')
      }
      await session.handle.writeFile(Buffer.from(contentBase64, 'base64'))
      return { ok: true }
    }
  )

  ipcMain.handle(
    'file-host:finishDownloadedFile',
    async (
      _event,
      args: { transferId?: string }
    ): Promise<{ canceled: false; destinationPath: string }> => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      const session = await closeDownloadSession(transferId, false)
      if (!session) {
        throw new Error('Download session not found')
      }
      let promoted = false
      try {
        await promoteDownloadedFile(
          session.tempPath,
          session.destinationPath,
          session.destinationExisted
        )
        promoted = true
        return { canceled: false, destinationPath: session.destinationPath }
      } finally {
        if (!promoted) {
          await cleanupLocalTransferPath(session.tempPath)
        }
      }
    }
  )

  ipcMain.handle(
    'file-host:cancelDownloadedFile',
    async (_event, args: { transferId?: string }): Promise<{ ok: true }> => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      await closeDownloadSession(transferId, true)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'file-host:writeFile',
    async (
      _event,
      args: { filePath: string; content: string; connectionId?: string }
    ): Promise<void> => {
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
    }
  )

  ipcMain.handle(
    'file-host:deletePath',
    async (
      _event,
      args: { targetPath: string; connectionId?: string; recursive?: boolean }
    ): Promise<void> => {
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
    }
  )

  registerFilesystemMutationHandlers(ipcMain, store)

  ipcMain.handle(
    'file-host:authorizeExternalPath',
    (_event, args: { targetPath: string }): void => {
      authorizeExternalPath(args.targetPath)
    }
  )

  ipcMain.handle(
    'file-host:stat',
    async (
      _event,
      args: { filePath: string; connectionId?: string }
    ): Promise<{ size: number; isDirectory: boolean; mtime: number }> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      const stats = await stat(filePath)
      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        mtime: stats.mtimeMs
      }
    }
  )

  ipcMain.handle(
    'file-host:pathExists',
    async (_event, args: { filePath: string; connectionId?: string }): Promise<boolean> => {
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
    }
  )

  initializeLocalLogTailAuthorization(store)
}
