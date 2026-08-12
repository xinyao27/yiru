import { type, type ContractRouter } from '@orpc/contract'

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
    .output(type<AiVaultListResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
