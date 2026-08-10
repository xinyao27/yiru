import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MAX_REPO_ICON_UPLOAD_BYTES } from '@yiru/workbench-model/workspace'
import { ipcMain, shell, dialog } from 'electron'
import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '~shared/shell-open-types'

import { openInExternalEditor, pathExists, validateLocalPathTarget } from '../external-editor/open'

export { EXTERNAL_EDITOR_CLI_COMMAND } from '../external-editor/open'

const REPO_ICON_IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png'
}

async function openInFileManager(pathValue: string): Promise<ShellOpenLocalPathResult> {
  const target = await validateLocalPathTarget(pathValue)
  if (!target.ok) {
    return target
  }
  try {
    // Why: the file-manager action uses reveal semantics, matching the
    // previous sidebar behavior while still validating the path per click.
    shell.showItemInFolder(target.path)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'launch-failed' }
  }
}

async function openWithSystemDefault(pathValue: string): Promise<boolean> {
  const target = await validateLocalPathTarget(pathValue)
  if (!target.ok) {
    return false
  }
  try {
    const errorMessage = await shell.openPath(target.path)
    return errorMessage.length === 0
  } catch {
    return false
  }
}

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openPath', async (_event, path: string): Promise<void> => {
    // Why: keep the legacy fire-and-forget renderer contract while reusing the
    // same absolute/existing path validation as the explicit file-manager API.
    void (await openInFileManager(path))
  })

  ipcMain.handle(
    'shell:openInFileManager',
    (_event, path: string): Promise<ShellOpenLocalPathResult> => openInFileManager(path)
  )

  ipcMain.handle(
    'shell:openInExternalEditor',
    (_event, request: ShellOpenExternalEditorRequest): Promise<ShellOpenExternalEditorResult> =>
      openInExternalEditor(request)
  )

  ipcMain.handle('shell:openUrl', (_event, rawUrl: string) => {
    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      return
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return
    }

    return shell.openExternal(parsed.toString())
  })

  ipcMain.handle('shell:openFilePath', async (_event, filePath: string): Promise<boolean> => {
    return openWithSystemDefault(filePath)
  })

  ipcMain.handle('shell:openFileUri', async (_event, rawUri: string) => {
    let parsed: URL
    try {
      parsed = new URL(rawUri)
    } catch {
      return
    }

    if (parsed.protocol !== 'file:') {
      return
    }

    // Only local files are supported. Remote hosts are intentionally rejected.
    if (parsed.hostname && parsed.hostname !== 'localhost') {
      return
    }

    let filePath: string
    try {
      filePath = fileURLToPath(parsed)
    } catch {
      return
    }

    const target = await validateLocalPathTarget(filePath)
    if (!target.ok) {
      return
    }

    await openWithSystemDefault(target.path)
  })

  ipcMain.handle('shell:pathExists', async (_event, filePath: string): Promise<boolean> => {
    return pathExists(filePath)
  })

  ipcMain.handle(
    'shell:pickDirectory',
    async (_event, args: { defaultPath?: string }): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        defaultPath: args.defaultPath,
        // Why: callers only need an existing folder grant; enabling native
        // creation can leave typed prefix directories behind on macOS.
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    }
  )

  // Why: window.prompt() and <input type="file"> are unreliable in Electron,
  // so we use the native OS dialog to let the user pick any attachment file.
  ipcMain.handle('shell:pickAttachment', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // Why: window.prompt() and <input type="file"> are unreliable in Electron,
  // so we use the native OS dialog to let the user pick an image file.
  ipcMain.handle('shell:pickImage', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(
    'shell:pickRepoIconImage',
    async (): Promise<{ dataUrl: string; fileName: string } | null> => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Repo icon images', extensions: ['png'] }]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const extension = extname(filePath).toLowerCase()
      const mimeType = REPO_ICON_IMAGE_MIME_TYPES[extension]
      if (!mimeType) {
        throw new Error('Repo icons must be PNG files.')
      }

      const stats = await stat(filePath)
      if (stats.size > MAX_REPO_ICON_UPLOAD_BYTES) {
        throw new Error('Repo icon image must be 256KB or smaller.')
      }

      const buffer = await readFile(filePath)
      return {
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        fileName: basename(filePath)
      }
    }
  )

  ipcMain.handle('shell:pickAudio', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['ogg', 'mp3', 'wav', 'm4a', 'aac', 'flac'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
