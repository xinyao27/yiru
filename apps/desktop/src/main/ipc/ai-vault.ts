import type {
  AiVaultListArgs,
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '@yiru/workbench-model/agent'
import { ipcMain } from 'electron'

import {
  configureAiVaultHandlers,
  type AiVaultHandlerOptions,
  listAiVaultSessions,
  listAiVaultSubagentSessions
} from '../ai-vault/ai-vault'

export function registerAiVaultHandlers(options: AiVaultHandlerOptions = {}): void {
  configureAiVaultHandlers(options)
  ipcMain.handle('aiVault:listSessions', (_event, args?: AiVaultListArgs) =>
    listAiVaultSessions(args)
  )
  ipcMain.handle(
    'aiVault:listSubagentSessions',
    (_event, args?: AiVaultSubagentListArgs): Promise<AiVaultSubagentListResult> =>
      listAiVaultSubagentSessions(args)
  )
}
