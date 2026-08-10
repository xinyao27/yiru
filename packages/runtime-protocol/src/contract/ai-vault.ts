import { type, type ContractRouter } from '@orpc/contract'

import { AiVaultListSessionsInputSchema, type AiVaultListResult } from '../ai-vault.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const AI_VAULT_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const aiVaultContract = {
  listSessions: withAccess(AI_VAULT_ACCESS, MOBILE_CLIENT)
    .input(AiVaultListSessionsInputSchema)
    .output(type<AiVaultListResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export { AI_VAULT_LIST_SESSIONS_CONTRACT, AiVaultListSessionsInputSchema } from '../ai-vault.js'
export type {
  AiVaultListResult,
  AiVaultListSessionsInput,
  AiVaultListSessionsLegacyContract
} from '../ai-vault.js'
