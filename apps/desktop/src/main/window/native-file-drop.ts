import { ipcMain, type BrowserWindow } from 'electron'
import { isNativeFileDropPayload, NATIVE_FILE_DROP_CHANNEL } from '~shared/native-file-drop'

import { publishShellEvent } from '../shell/events'

export function registerNativeFileDropAdapter(mainWindow: BrowserWindow): void {
  const webContents = mainWindow.webContents
  const relayDrop = (event: Electron.IpcMainEvent, payload: unknown): void => {
    if (
      mainWindow.isDestroyed() ||
      webContents.isDestroyed() ||
      event.sender !== webContents ||
      !isNativeFileDropPayload(payload)
    ) {
      return
    }
    publishShellEvent(webContents.id, { type: 'uiFileDrop', payload })
  }

  ipcMain.on(NATIVE_FILE_DROP_CHANNEL, relayDrop)
  mainWindow.on('closed', () => ipcMain.removeListener(NATIVE_FILE_DROP_CHANNEL, relayDrop))
}
