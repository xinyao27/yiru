import { z } from 'zod'

import { AI_VAULT_SCOPE_PATHS_MAX_COUNT, type AiVaultListResult } from './model/agent.js'
import {
  normalizeExecutionHostScope,
  parseExecutionHostId,
  type ExecutionHostScope
} from './model/workspace.js'

const AI_VAULT_SCOPE_PATH_MAX_LENGTH = 4096
const AI_VAULT_LIMIT_MAX = 2000

const OptionalBoolean = z
  .unknown()
  .transform((value) => (typeof value === 'boolean' ? value : undefined))
  .pipe(z.union([z.boolean(), z.undefined()]))
  .optional()

const RuntimeExecutionHostIdSchema = z.string().transform((value, context): `runtime:${string}` => {
  const parsed = parseExecutionHostId(value)
  if (parsed?.kind === 'runtime') {
    return parsed.id
  }
  context.addIssue({ code: 'custom', message: 'Invalid runtime execution host id' })
  return z.NEVER
})

const ExecutionHostScopeSchema = z
  .string()
  .transform((value): ExecutionHostScope => normalizeExecutionHostScope(value))

export const AiVaultListSessionsInputSchema = z.object({
  limit: z
    .unknown()
    .transform((value) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
    )
    .pipe(z.union([z.number().int().max(AI_VAULT_LIMIT_MAX), z.undefined()]))
    .optional(),
  force: OptionalBoolean,
  // Why: the native iOS client can request the legacy 500-session recency
  // window while asking the host to trim optional usage payloads and preview
  // text before encryption. This keeps the response useful without crossing
  // URLSession's single-WebSocket-message limit.
  compact: OptionalBoolean,
  scopePaths: z
    .array(z.string().min(1).max(AI_VAULT_SCOPE_PATH_MAX_LENGTH))
    .transform((paths) => paths.slice(0, AI_VAULT_SCOPE_PATHS_MAX_COUNT))
    .optional(),
  executionHostScope: ExecutionHostScopeSchema.optional(),
  executionHostId: RuntimeExecutionHostIdSchema.optional()
})

export type AiVaultListSessionsInput = z.output<typeof AiVaultListSessionsInputSchema>

export type AiVaultListSessionsLegacyContract = Readonly<{
  name: 'aiVault.listSessions'
  params: typeof AiVaultListSessionsInputSchema
  mobile: true
  resultType?: AiVaultListResult
}>

export const AI_VAULT_LIST_SESSIONS_CONTRACT: AiVaultListSessionsLegacyContract = {
  name: 'aiVault.listSessions',
  params: AiVaultListSessionsInputSchema,
  mobile: true
}

export type { AiVaultListResult }
