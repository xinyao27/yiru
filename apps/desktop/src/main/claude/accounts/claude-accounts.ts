import { ipcMain } from 'electron'

import type { ClaudeAccountSelectionTarget } from './runtime-selection'
import type { ClaudeAccountAddTarget, ClaudeAccountService } from './service'

export function registerClaudeAccountHandlers(claudeAccounts: ClaudeAccountService): void {
  ipcMain.handle('claudeAccounts:list', () => claudeAccounts.listAccounts())
  ipcMain.handle('claudeAccounts:add', (_event, args?: ClaudeAccountAddTarget) =>
    claudeAccounts.addAccount(args)
  )
  ipcMain.handle('claudeAccounts:cancelPendingLogin', () => claudeAccounts.cancelPendingLogin())
  ipcMain.handle('claudeAccounts:reauthenticate', (_event, args: { accountId: string }) =>
    claudeAccounts.reauthenticateAccount(args.accountId)
  )
  ipcMain.handle('claudeAccounts:remove', (_event, args: { accountId: string }) =>
    claudeAccounts.removeAccount(args.accountId)
  )
  ipcMain.handle(
    'claudeAccounts:select',
    (_event, args: { accountId: string | null } & ClaudeAccountSelectionTarget) => {
      if (!args.runtime) {
        return claudeAccounts.selectAccount(args.accountId)
      }
      return claudeAccounts.selectAccountForTarget(args.accountId, args)
    }
  )
}
