import { ipcMain, type WebContents } from 'electron'

import {
  LANGUAGE_SERVER_EVENT_CHANNEL,
  type LanguageServerDocumentUriArgs,
  type LanguageServerLocationArgs,
  type LanguageServerSendArgs,
  type LanguageServerStartArgs
} from '../../shared/language-server'
import { LanguageServerManager } from '../language-server-manager'
import type { Store } from '../persistence'

export function registerLanguageServerHandlers(store: Store): void {
  const manager = new LanguageServerManager(store)
  const registeredOwners = new Set<number>()
  const ownerId = (webContentsId: number): string => `renderer:${webContentsId}`
  const ensureOwner = (sender: WebContents): string => {
    const owner = ownerId(sender.id)
    if (registeredOwners.has(sender.id)) {
      return owner
    }
    registeredOwners.add(sender.id)
    const unsubscribe = manager.subscribeOwner(owner, (event) => {
      if (!sender.isDestroyed()) {
        sender.send(LANGUAGE_SERVER_EVENT_CHANNEL, event)
      }
    })
    sender.once('destroyed', () => {
      registeredOwners.delete(sender.id)
      unsubscribe()
      manager.releaseOwner(owner)
    })
    return owner
  }

  ipcMain.handle('languageServers:start', (event, args: LanguageServerStartArgs) =>
    manager.start(ensureOwner(event.sender), args)
  )
  ipcMain.handle('languageServers:send', (event, args: LanguageServerSendArgs) =>
    manager.send(ensureOwner(event.sender), args)
  )
  ipcMain.handle('languageServers:stop', (event, args: { sessionId: string }) =>
    manager.stop(ensureOwner(event.sender), args?.sessionId)
  )
  ipcMain.handle(
    'languageServers:resolveDocumentUri',
    (event, args: LanguageServerDocumentUriArgs) =>
      manager.resolveDocumentUri(ensureOwner(event.sender), args)
  )
  ipcMain.handle('languageServers:resolveLocation', (event, args: LanguageServerLocationArgs) =>
    manager.resolveLocation(ensureOwner(event.sender), args)
  )
  ipcMain.handle('languageServers:getLogs', (event, args: { sessionId: string }) =>
    manager.getLogs(ensureOwner(event.sender), args?.sessionId)
  )
}
