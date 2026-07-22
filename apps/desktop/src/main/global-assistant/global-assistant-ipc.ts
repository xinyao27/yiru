import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'

import type { GlobalAssistantSession } from '../../shared/global-assistant-types'
import type { GlobalAssistantService } from './global-assistant-service'

function assertMainWindowSender(event: IpcMainInvokeEvent, mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('global_assistant_sender_not_allowed')
  }
}

export function registerGlobalAssistantHandlers(
  mainWindow: BrowserWindow,
  service: GlobalAssistantService
): void {
  ipcMain.removeHandler('globalAssistant:getOrCreate')
  ipcMain.removeHandler('globalAssistant:restart')
  ipcMain.removeHandler('globalAssistant:showTerminal')

  ipcMain.handle('globalAssistant:getOrCreate', async (event): Promise<GlobalAssistantSession> => {
    assertMainWindowSender(event, mainWindow)
    return service.getOrCreate()
  })
  ipcMain.handle('globalAssistant:restart', async (event): Promise<GlobalAssistantSession> => {
    assertMainWindowSender(event, mainWindow)
    return service.restart()
  })
  ipcMain.handle('globalAssistant:showTerminal', async (event): Promise<void> => {
    assertMainWindowSender(event, mainWindow)
    await service.showTerminal()
  })
}
