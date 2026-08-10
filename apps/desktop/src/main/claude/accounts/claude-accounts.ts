import { ipcMain } from 'electron'

import type { ClaudeAccountAddTarget, ClaudeAccountService } from './service'

// Why: select/remove moved to the runtime contract (`accounts.selectClaude` /
// `accounts.removeClaude`, see rpc/methods/accounts.ts) — provider-accounts-client.ts
// calls them through oRPC now, including for the local target. add/reauthenticate/
// cancelPendingLogin stay on IPC because they spawn `claude login` PTYs that need
// a desktop browser.
export function registerClaudeAccountHandlers(claudeAccounts: ClaudeAccountService): void {
  ipcMain.handle('claudeAccounts:list', () => claudeAccounts.listAccounts())
  ipcMain.handle('claudeAccounts:add', (_event, args?: ClaudeAccountAddTarget) =>
    claudeAccounts.addAccount(args)
  )
  ipcMain.handle('claudeAccounts:cancelPendingLogin', () => claudeAccounts.cancelPendingLogin())
  ipcMain.handle('claudeAccounts:reauthenticate', (_event, args: { accountId: string }) =>
    claudeAccounts.reauthenticateAccount(args.accountId)
  )
}
