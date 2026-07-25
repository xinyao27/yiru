import { randomUUID } from 'node:crypto'
import { rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { getRuntimePathBasename } from '@yiru/workbench-model/platform'
import { BrowserWindow, dialog, ipcMain } from 'electron'

import { sanitizeLocalDownloadFilename } from '../local-download-filename'
import { promoteLocalDownloadedFolder } from '../local-downloaded-folder-promotion'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { FolderDownloader } from '../providers/ssh-filesystem-download'
import type { IFilesystemProvider } from '../providers/types'
import { isENOENT } from './filesystem-auth'
import { registerDownloadedFolderSessionHandlers } from './filesystem-downloaded-folder-sessions'

type DownloadFolderResult = { canceled: true } | { canceled: false; destinationPath: string }

function getFolderDownloader(provider: IFilesystemProvider): FolderDownloader | null {
  // Why: recursive transfer is an SSH/SFTP extension, not a promise every
  // filesystem provider can safely implement.
  const downloadFolder = (provider as IFilesystemProvider & { downloadFolder?: FolderDownloader })
    .downloadFolder
  return typeof downloadFolder === 'function' ? downloadFolder.bind(provider) : null
}

function validateRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`)
  }
  return value
}

function createSiblingTransferPath(destinationPath: string, suffix: string): string {
  // Why: promotion uses no-clobber operations that must stay on the same
  // destination volume, so staging directories intentionally remain siblings.
  return join(dirname(destinationPath), `.${randomUUID()}.${suffix}`)
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
    // Why: cleanup must not mask the transfer error, but a leaked recursive
    // staging tree needs enough visibility to diagnose and remove it.
    console.warn(`[filesystem] Failed to remove temporary folder download '${dirPath}'`, error)
  }
}

export function registerFilesystemDownloadFolderHandlers(): void {
  registerDownloadedFolderSessionHandlers()

  ipcMain.handle(
    'fs:downloadFolder',
    async (
      event,
      args: { dirPath?: string; connectionId?: string }
    ): Promise<DownloadFolderResult> => {
      const dirPath = validateRequiredString(args?.dirPath, 'dirPath')
      const connectionId = validateRequiredString(args?.connectionId, 'connectionId')
      const provider = requireSshFilesystemProvider(connectionId)
      const downloadFolder = getFolderDownloader(provider)
      if (!downloadFolder) {
        throw new Error(
          'Remote folder download is unavailable. Reconnect the SSH target and retry.'
        )
      }
      const abortController = new AbortController()
      const abortOnSenderDestroyed = (): void => {
        abortController.abort(new Error('Folder download canceled because the window closed'))
      }
      event.sender.once('destroyed', abortOnSenderDestroyed)
      if (event.sender.isDestroyed()) {
        abortOnSenderDestroyed()
      }
      try {
        abortController.signal.throwIfAborted()
        const destinationBasename = sanitizeLocalDownloadFilename(getRuntimePathBasename(dirPath))
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
        // Why: open the local picker before remote validation so SSH latency
        // never delays immediate click feedback.
        const dialogOptions: Electron.OpenDialogOptions = {
          properties: ['openDirectory', 'createDirectory']
        }
        const dialogResult = parentWindow
          ? await dialog.showOpenDialog(parentWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions)
        const destinationParent = dialogResult.filePaths[0]
        if (dialogResult.canceled || !destinationParent) {
          return { canceled: true }
        }
        abortController.signal.throwIfAborted()
        const destinationPath = join(destinationParent, destinationBasename)
        await assertDestinationAvailable(destinationPath)
        const tempPath = createSiblingTransferPath(destinationPath, 'download')
        try {
          await downloadFolder(dirPath, tempPath, { signal: abortController.signal })
          abortController.signal.throwIfAborted()
          await promoteLocalDownloadedFolder(tempPath, destinationPath, abortController.signal)
          return { canceled: false, destinationPath }
        } finally {
          await cleanupTransferDirectory(tempPath)
        }
      } finally {
        event.sender.removeListener('destroyed', abortOnSenderDestroyed)
      }
    }
  )
}
