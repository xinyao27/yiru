import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'

import type { FridaySession } from '../../shared/friday-types'
import type { FridayService } from './service'

function assertMainWindowSender(event: IpcMainInvokeEvent, mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('friday_sender_not_allowed')
  }
}

export function registerFridayHandlers(mainWindow: BrowserWindow, service: FridayService): void {
  ipcMain.removeHandler('friday:getOrCreate')
  ipcMain.removeHandler('friday:restart')

  ipcMain.handle('friday:getOrCreate', async (event): Promise<FridaySession> => {
    assertMainWindowSender(event, mainWindow)
    return service.getOrCreate()
  })
  ipcMain.handle('friday:restart', async (event): Promise<FridaySession> => {
    assertMainWindowSender(event, mainWindow)
    return service.restart()
  })
}
