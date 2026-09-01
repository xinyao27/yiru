import type { AiVaultListSessionsInput } from '@yiru/runtime-protocol/ai-vault'
import type {
  AiVaultListResult,
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '@yiru/runtime-protocol/model/agent'

import { callShellOrpc } from './orpc-client'

export function listAiVaultSessions(input: AiVaultListSessionsInput): Promise<AiVaultListResult> {
  return callShellOrpc((client) => client.shell.aiVault.listSessions, input)
}

export function listAiVaultSubagentSessions(
  input: AiVaultSubagentListArgs
): Promise<AiVaultSubagentListResult> {
  return callShellOrpc((client) => client.shell.aiVault.listSubagentSessions, input)
}
