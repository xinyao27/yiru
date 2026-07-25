import { randomUUID } from 'node:crypto'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { BrowserWindow, dialog, ipcMain } from 'electron'

import { sanitizeLocalDownloadFilename } from '../local-download-filename'
import { promoteLocalDownloadedFolder } from '../local-downloaded-folder-promotion'
import { isENOENT } from './filesystem-auth'

type DownloadedFolderSession = {
  destinationPath: string
  tempPath: string
  senderId: number
  cleanupTimer: ReturnType<typeof setTimeout>
  activeFile: { key: string; handle: FileHandle; position: number } | null
  sender: Electron.WebContents
  onSenderDestroyed: () => void
}

const DOWNLOAD_SESSION_TTL_MS = 30 * 60 * 1000
const MAX_FOLDER_PATH_SEGMENTS = 1_024
const MAX_BASE64_CHUNK_CHARS = 1024 * 1024
const BASE64_CHUNK_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function validateRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`)
  }
  return value
}

function validatePathSegments(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FOLDER_PATH_SEGMENTS) {
    throw new Error('pathSegments must identify a folder entry')
  }
  // Why: renderer-provided segments become native local paths; either separator
  // could escape a segment after crossing from a differently hosted runtime.
  return value.map((segment) => {
    if (
      typeof segment !== 'string' ||
      !segment ||
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0')
    ) {
      throw new Error('pathSegments contains an invalid entry name')
    }
    return sanitizeLocalDownloadFilename(segment)
  })
}

function validateBase64Chunk(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_BASE64_CHUNK_CHARS ||
    value.length % 4 === 1 ||
    !BASE64_CHUNK_PATTERN.test(value)
  ) {
    throw new Error('contentBase64 must be valid base64')
  }
  return value
}

async function assertDestinationAvailable(destinationPath: string): Promise<void> {
  try {
    await stat(destinationPath)
  } catch (error) {
    if (isENOENT(error)) {
      return
    }
    throw error
  }
  throw new Error('Destination folder already exists')
}

async function cleanupTransferDirectory(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true })
  } catch (error) {
    console.warn(`[filesystem] Failed to remove temporary folder download '${dirPath}'`, error)
  }
}

function senderIdForEvent(event: Electron.IpcMainInvokeEvent): number {
  return typeof event.sender.id === 'number' ? event.sender.id : Number.NaN
}

function requireOwnedSession(
  sessions: Map<string, DownloadedFolderSession>,
  transferId: string,
  senderId: number
): DownloadedFolderSession {
  const session = sessions.get(transferId)
  if (!session || session.senderId !== senderId) {
    throw new Error('Folder download session not found')
  }
  return session
}

async function writeFileChunk(
  session: DownloadedFolderSession,
  contentBase64: string
): Promise<void> {
  if (!session.activeFile || !contentBase64) {
    return
  }
  const buffer = Buffer.from(contentBase64, 'base64')
  let written = 0
  while (written < buffer.length) {
    const result = await session.activeFile.handle.write(
      buffer,
      written,
      buffer.length - written,
      session.activeFile.position + written
    )
    if (result.bytesWritten <= 0) {
      throw new Error('Local folder download stalled while writing a file')
    }
    written += result.bytesWritten
  }
  session.activeFile.position += written
}

export function registerDownloadedFolderSessionHandlers(): void {
  const sessions = new Map<string, DownloadedFolderSession>()

  const closeSession = async (transferId: string, cleanupTemp: boolean) => {
    const session = sessions.get(transferId)
    if (!session) {
      return null
    }
    sessions.delete(transferId)
    clearTimeout(session.cleanupTimer)
    session.sender.removeListener('destroyed', session.onSenderDestroyed)
    await session.activeFile?.handle.close().catch(() => {})
    session.activeFile = null
    if (cleanupTemp) {
      await cleanupTransferDirectory(session.tempPath)
    }
    return session
  }

  const cleanupSessionsForSender = (senderId: number): void => {
    for (const [transferId, session] of sessions) {
      if (session.senderId === senderId) {
        void closeSession(transferId, true)
      }
    }
  }

  ipcMain.handle('fs:startDownloadedFolder', async (event, args: { suggestedName?: string }) => {
    const suggestedName = sanitizeLocalDownloadFilename(
      validateRequiredString(args?.suggestedName, 'suggestedName')
    )
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory']
    }
    const dialogResult = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    const destinationParent = dialogResult.filePaths[0]
    if (dialogResult.canceled || !destinationParent) {
      return { canceled: true as const }
    }
    const destinationPath = join(destinationParent, suggestedName)
    await assertDestinationAvailable(destinationPath)
    const tempPath = join(dirname(destinationPath), `.${randomUUID()}.download`)
    const transferId = randomUUID()
    try {
      await mkdir(tempPath, { recursive: false })
      const senderId = senderIdForEvent(event)
      const cleanupTimer = setTimeout(
        () => void closeSession(transferId, true),
        DOWNLOAD_SESSION_TTL_MS
      )
      cleanupTimer.unref?.()
      const onSenderDestroyed = (): void => cleanupSessionsForSender(senderId)
      sessions.set(transferId, {
        destinationPath,
        tempPath,
        senderId,
        cleanupTimer,
        activeFile: null,
        sender: event.sender,
        onSenderDestroyed
      })
      event.sender.once('destroyed', onSenderDestroyed)
      return { canceled: false as const, destinationPath, transferId }
    } catch (error) {
      await cleanupTransferDirectory(tempPath)
      throw error
    }
  })

  ipcMain.handle(
    'fs:createDownloadedFolderDirectory',
    async (event, args: { transferId?: string; pathSegments?: unknown }) => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      const session = requireOwnedSession(sessions, transferId, senderIdForEvent(event))
      if (session.activeFile) {
        throw new Error('Finish the active downloaded file before creating a directory')
      }
      await mkdir(join(session.tempPath, ...validatePathSegments(args?.pathSegments)), {
        recursive: false
      })
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    'fs:appendDownloadedFolderFileChunk',
    async (
      event,
      args: {
        transferId?: string
        pathSegments?: unknown
        contentBase64?: unknown
        first?: boolean
        last?: boolean
      }
    ) => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      const session = requireOwnedSession(sessions, transferId, senderIdForEvent(event))
      const sanitizedSegments = validatePathSegments(args?.pathSegments)
      const key = JSON.stringify(sanitizedSegments)
      if (args?.first === true) {
        if (session.activeFile) {
          throw new Error('Another downloaded file is still active')
        }
        session.activeFile = {
          key,
          handle: await open(join(session.tempPath, ...sanitizedSegments), 'wx'),
          position: 0
        }
      }
      if (!session.activeFile || session.activeFile.key !== key) {
        throw new Error('Downloaded file chunk does not match the active file')
      }
      try {
        await writeFileChunk(session, validateBase64Chunk(args?.contentBase64))
        if (args?.last === true) {
          await session.activeFile.handle.close()
          session.activeFile = null
        }
      } catch (error) {
        await session.activeFile?.handle.close().catch(() => {})
        session.activeFile = null
        throw error
      }
      return { ok: true as const }
    }
  )

  ipcMain.handle('fs:finishDownloadedFolder', async (event, args: { transferId?: string }) => {
    const transferId = validateRequiredString(args?.transferId, 'transferId')
    const owned = requireOwnedSession(sessions, transferId, senderIdForEvent(event))
    if (owned.activeFile) {
      throw new Error('Downloaded folder still has an active file')
    }
    const session = await closeSession(transferId, false)
    if (!session) {
      throw new Error('Folder download session not found')
    }
    try {
      await promoteLocalDownloadedFolder(session.tempPath, session.destinationPath)
      return { canceled: false as const, destinationPath: session.destinationPath }
    } finally {
      await cleanupTransferDirectory(session.tempPath)
    }
  })

  ipcMain.handle('fs:cancelDownloadedFolder', async (event, args: { transferId?: string }) => {
    const transferId = validateRequiredString(args?.transferId, 'transferId')
    requireOwnedSession(sessions, transferId, senderIdForEvent(event))
    await closeSession(transferId, true)
    return { ok: true as const }
  })
}
