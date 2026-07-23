import { AI_VAULT_SCOPE_PATHS_MAX_COUNT, type AiVaultListResult } from '@yiru/workbench-model/agent'
import { parseExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'

import { defineRuntimeMethodContract } from '../runtime-method-contract'
import { OptionalBoolean } from './runtime-method-params'

const AI_VAULT_SCOPE_PATH_MAX_LENGTH = 4096
const AI_VAULT_LIMIT_MAX = 2000

const ExecutionHostId = z.string().transform((value, ctx): `runtime:${string}` => {
  const parsed = parseExecutionHostId(value)
  if (parsed?.kind === 'runtime') {
    return parsed.id
  }
  ctx.addIssue({
    code: 'custom',
    message: 'Invalid runtime execution host id'
  })
  return z.NEVER
})

const AiVaultListSessionsParams = z.object({
  limit: z
    .unknown()
    .transform((value) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
    )
    .pipe(z.union([z.number().int().max(AI_VAULT_LIMIT_MAX), z.undefined()]))
    .optional(),
  force: OptionalBoolean,
  scopePaths: z
    .array(z.string().min(1).max(AI_VAULT_SCOPE_PATH_MAX_LENGTH))
    // Why: these paths only widen discovery; clamping keeps older uncapped
    // producers compatible without allowing an unbounded host scan.
    .transform((paths) => paths.slice(0, AI_VAULT_SCOPE_PATHS_MAX_COUNT))
    .optional(),
  // Why: the host id only stamps cached results; it must never redirect the
  // host-local scan that this runtime owns.
  executionHostId: ExecutionHostId.optional()
})

export const AI_VAULT_LIST_SESSIONS_CONTRACT = defineRuntimeMethodContract<AiVaultListResult>()({
  name: 'aiVault.listSessions',
  params: AiVaultListSessionsParams,
  mobile: true
})
