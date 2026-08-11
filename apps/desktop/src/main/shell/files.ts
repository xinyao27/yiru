import { webContents } from 'electron'

import { createFilesystemService } from '../filesystem/filesystem'
import type { NativePathServices } from '../filesystem/native-path-services'
import type { Store } from '../persistence'

type ShellFilesService = ReturnType<typeof createFilesystemService>

let shellFilesService: ShellFilesService | null = null

export function initializeShellFilesService(
  store: Store,
  nativePathServices: NativePathServices
): void {
  shellFilesService = createFilesystemService(store, nativePathServices)
}

export function getShellFilesService(): ShellFilesService {
  if (!shellFilesService) {
    throw new Error('Shell files service has not been initialized')
  }
  return shellFilesService
}

export function requireShellRenderer(webContentsId: number | undefined) {
  if (webContentsId === undefined) {
    throw new Error('unavailable_on_host: shell procedure requires an Electron window')
  }
  const renderer = webContents.fromId(webContentsId)
  if (!renderer || renderer.isDestroyed()) {
    throw new Error('unavailable_on_host: Electron window is unavailable')
  }
  return renderer
}
