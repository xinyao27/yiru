import { randomUUID } from 'node:crypto'
import type { FileHandle } from 'node:fs/promises'
import { open, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { RuntimeRendererTarget } from '~main/runtime/host/renderer-target'

import { sanitizeLocalDownloadFilename } from '../local-download-filename'
import { isENOENT } from './auth'
import type { NativePathServices } from './native-path-services'

type DownloadSession = {
  destinationPath: string
  tempPath: string
  destinationExisted: boolean
  handle: FileHandle
  cleanupTimer: ReturnType<typeof setTimeout>
  senderId: number
}

type DownloadFileResult = { canceled: true } | { canceled: false; destinationPath: string }
type StartDownloadResult =
  | { canceled: true }
  | { canceled: false; transferId: string; destinationPath: string }

const DOWNLOAD_SESSION_TTL_MS = 30 * 60 * 1000

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`)
  }
  return value
}

function createSiblingTransferPath(destinationPath: string, suffix: string): string {
  return join(dirname(destinationPath), `.${randomUUID()}.${suffix}`)
}

async function cleanupTransferPath(filePath: string | null): Promise<void> {
  if (filePath) {
    await rm(filePath, { force: true }).catch(() => {})
  }
}

async function destinationExisted(destinationPath: string): Promise<boolean> {
  try {
    const destinationStat = await stat(destinationPath)
    if (destinationStat.isDirectory()) {
      throw new Error('Cannot download to a directory')
    }
    return true
  } catch (error) {
    if (isENOENT(error)) {
      return false
    }
    throw error
  }
}

async function assertDestinationUnclaimed(destinationPath: string): Promise<void> {
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
  existed: boolean
): Promise<void> {
  if (!existed) {
    await assertDestinationUnclaimed(destinationPath)
    await rename(tempPath, destinationPath)
    return
  }
  const backupPath = createSiblingTransferPath(destinationPath, 'backup')
  let backupCreated = false
  try {
    await rename(destinationPath, backupPath)
    backupCreated = true
    await rename(tempPath, destinationPath)
    await cleanupTransferPath(backupPath)
  } catch (error) {
    if (backupCreated) {
      await rename(backupPath, destinationPath).catch(() => {})
    }
    throw error
  }
}

export function createFileDownloadService(nativePathServices: NativePathServices) {
  const sessions = new Map<string, DownloadSession>()

  async function closeSession(
    transferId: string,
    cleanupTemp: boolean
  ): Promise<DownloadSession | null> {
    const session = sessions.get(transferId)
    if (!session) {
      return null
    }
    sessions.delete(transferId)
    clearTimeout(session.cleanupTimer)
    await session.handle.close().catch(() => {})
    if (cleanupTemp) {
      await cleanupTransferPath(session.tempPath)
    }
    return session
  }

  function cleanupSessionsForSender(senderId: number): void {
    for (const [transferId, session] of sessions) {
      if (session.senderId === senderId) {
        void closeSession(transferId, true)
      }
    }
  }

  return {
    saveDownload: async (
      sender: RuntimeRendererTarget,
      args: { suggestedName?: string; content?: string; encoding?: 'utf8' | 'base64' }
    ): Promise<DownloadFileResult> => {
      const suggestedName = sanitizeLocalDownloadFilename(
        requiredString(args?.suggestedName, 'suggestedName')
      )
      if (typeof args?.content !== 'string') {
        throw new Error('content is required')
      }
      const destinationPath = await nativePathServices.chooseDownloadFile(sender.id, suggestedName)
      if (!destinationPath) {
        return { canceled: true }
      }
      const existed = await destinationExisted(destinationPath)
      const tempPath = createSiblingTransferPath(destinationPath, 'download')
      let promoted = false
      try {
        const content = Buffer.from(args.content, args.encoding === 'base64' ? 'base64' : 'utf8')
        await writeFile(tempPath, content)
        await promoteDownloadedFile(tempPath, destinationPath, existed)
        promoted = true
        return { canceled: false, destinationPath }
      } finally {
        if (!promoted) {
          await cleanupTransferPath(tempPath)
        }
      }
    },

    startDownload: async (
      sender: RuntimeRendererTarget,
      args: { suggestedName?: string }
    ): Promise<StartDownloadResult> => {
      const suggestedName = sanitizeLocalDownloadFilename(
        requiredString(args?.suggestedName, 'suggestedName')
      )
      const destinationPath = await nativePathServices.chooseDownloadFile(sender.id, suggestedName)
      if (!destinationPath) {
        return { canceled: true }
      }
      const existed = await destinationExisted(destinationPath)
      const tempPath = createSiblingTransferPath(destinationPath, 'download')
      const transferId = randomUUID()
      try {
        const handle = await open(tempPath, 'wx')
        const senderId = typeof sender.id === 'number' ? sender.id : Number.NaN
        const cleanupTimer = setTimeout(
          () => void closeSession(transferId, true),
          DOWNLOAD_SESSION_TTL_MS
        )
        cleanupTimer.unref?.()
        sessions.set(transferId, {
          destinationPath,
          tempPath,
          destinationExisted: existed,
          handle,
          cleanupTimer,
          senderId
        })
        sender.once?.('destroyed', () => cleanupSessionsForSender(senderId))
        return { canceled: false, transferId, destinationPath }
      } catch (error) {
        await cleanupTransferPath(tempPath)
        throw error
      }
    },

    appendDownloadChunk: async (args: {
      transferId?: string
      contentBase64?: string
    }): Promise<{ ok: true }> => {
      const transferId = requiredString(args?.transferId, 'transferId')
      const contentBase64 = requiredString(args?.contentBase64, 'contentBase64')
      const session = sessions.get(transferId)
      if (!session) {
        throw new Error('Download session not found')
      }
      await session.handle.writeFile(Buffer.from(contentBase64, 'base64'))
      return { ok: true }
    },

    finishDownload: async (args: {
      transferId?: string
    }): Promise<{ canceled: false; destinationPath: string }> => {
      const transferId = requiredString(args?.transferId, 'transferId')
      const session = await closeSession(transferId, false)
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
          await cleanupTransferPath(session.tempPath)
        }
      }
    },

    cancelDownload: async (args: { transferId?: string }): Promise<{ ok: true }> => {
      await closeSession(requiredString(args?.transferId, 'transferId'), true)
      return { ok: true }
    }
  }
}
