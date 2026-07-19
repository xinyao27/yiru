import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import { LocalLanguageServerManager } from '../local-language-server-manager'
import type {
  LanguageServerDocumentUriArgs,
  LanguageServerLocationArgs,
  LanguageServerSendArgs,
  LanguageServerStartArgs
} from '../../shared/language-server'

export function registerLanguageServerHandlers(store: Store): void {
  const manager = new LocalLanguageServerManager(store)

  ipcMain.handle('languageServers:start', (event, args: LanguageServerStartArgs) =>
    manager.start(event.sender, args)
  )
  ipcMain.handle('languageServers:send', (event, args: LanguageServerSendArgs) =>
    manager.send(event.sender.id, args)
  )
  ipcMain.handle('languageServers:stop', (event, args: { sessionId: string }) =>
    manager.stop(event.sender.id, args?.sessionId)
  )
  ipcMain.handle(
    'languageServers:resolveDocumentUri',
    (event, args: LanguageServerDocumentUriArgs) =>
      manager.resolveDocumentUri(event.sender.id, args)
  )
  ipcMain.handle('languageServers:resolveLocation', (event, args: LanguageServerLocationArgs) =>
    manager.resolveLocation(event.sender.id, args)
  )
  ipcMain.handle('languageServers:getLogs', (event, args: { sessionId: string }) =>
    manager.getLogs(event.sender.id, args?.sessionId)
  )
}
