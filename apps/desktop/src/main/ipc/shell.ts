import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MAX_REPO_ICON_UPLOAD_BYTES } from '@yiru/workbench-model/workspace'
import { dialog, shell } from 'electron'
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
    return (await shell.openPath(target.path)).length === 0
  } catch {
    return false
  }
}

async function pickFile(filters?: Electron.FileFilter[]): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export function createShellPlatformService() {
  return {
    openPath: async (path: string): Promise<void> => {
      void (await openInFileManager(path))
    },
    openInFileManager,
    openInExternalEditor: (
      request: ShellOpenExternalEditorRequest
    ): Promise<ShellOpenExternalEditorResult> => openInExternalEditor(request),
    openUrl: (rawUrl: string): Promise<void> | undefined => {
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
    },
    openFilePath: openWithSystemDefault,
    openFileUri: async (rawUri: string): Promise<void> => {
      let parsed: URL
      try {
        parsed = new URL(rawUri)
      } catch {
        return
      }
      if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) {
        return
      }
      let filePath: string
      try {
        filePath = fileURLToPath(parsed)
      } catch {
        return
      }
      const target = await validateLocalPathTarget(filePath)
      if (target.ok) {
        await openWithSystemDefault(target.path)
      }
    },
    pathExists,
    pickDirectory: async (args: { defaultPath?: string }): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        defaultPath: args.defaultPath,
        properties: ['openDirectory']
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    pickAttachment: (): Promise<string | null> => pickFile(),
    pickImage: (): Promise<string | null> =>
      pickFile([
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
        }
      ]),
    pickRepoIconImage: async (): Promise<{ dataUrl: string; fileName: string } | null> => {
      const filePath = await pickFile([{ name: 'Repo icon images', extensions: ['png'] }])
      if (!filePath) {
        return null
      }
      const mimeType = REPO_ICON_IMAGE_MIME_TYPES[extname(filePath).toLowerCase()]
      if (!mimeType) {
        throw new Error('Repo icons must be PNG files.')
      }
      if ((await stat(filePath)).size > MAX_REPO_ICON_UPLOAD_BYTES) {
        throw new Error('Repo icon image must be 256KB or smaller.')
      }
      const buffer = await readFile(filePath)
      return {
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        fileName: basename(filePath)
      }
    },
    pickAudio: (): Promise<string | null> =>
      pickFile([{ name: 'Audio', extensions: ['ogg', 'mp3', 'wav', 'm4a', 'aac', 'flac'] }])
  }
}

export type ShellPlatformService = ReturnType<typeof createShellPlatformService>
