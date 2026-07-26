import { ipcMain } from 'electron'

import { getGrokAccountStatus } from './status'

export function registerGrokAccountHandlers(): void {
  ipcMain.handle('grokAccounts:getStatus', () => getGrokAccountStatus())
}
