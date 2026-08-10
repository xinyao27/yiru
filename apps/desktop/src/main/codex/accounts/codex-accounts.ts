import { ipcMain } from 'electron'

import type { CodexAccountAddTarget, CodexAccountService } from './service'

// Why: select/remove moved to the runtime contract (`accounts.selectCodex` /
// `accounts.removeCodex`, see rpc/methods/accounts.ts) — provider-accounts-client.ts
// calls them through oRPC now, including for the local target. add/reauthenticate
// stay on IPC because they spawn a `codex login` PTY that needs a desktop browser.
export function registerCodexAccountHandlers(codexAccounts: CodexAccountService): void {
  ipcMain.handle('codexAccounts:list', () => codexAccounts.listAccounts())
  ipcMain.handle('codexAccounts:add', (_event, args?: CodexAccountAddTarget) =>
    codexAccounts.addAccount(args)
  )
  ipcMain.handle('codexAccounts:reauthenticate', (_event, args: { accountId: string }) =>
    codexAccounts.reauthenticateAccount(args.accountId)
  )
}
