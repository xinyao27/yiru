import { type, type ContractRouter } from '@orpc/contract'
import type {
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '@yiru/workbench-model/agent'

import { AiVaultListSessionsInputSchema, type AiVaultListResult } from '../../ai-vault.js'
import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_AI_VAULT_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const

export const shellAiVaultContract = {
  listSessions: withAccess(SHELL_AI_VAULT_ACCESS)
    .input(AiVaultListSessionsInputSchema)
    .output(type<AiVaultListResult>()),
  listSubagentSessions: withAccess(SHELL_AI_VAULT_ACCESS)
    .input(type<AiVaultSubagentListArgs>())
    .output(type<AiVaultSubagentListResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
