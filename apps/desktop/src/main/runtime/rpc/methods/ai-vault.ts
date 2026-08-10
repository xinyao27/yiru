import type { AiVaultListResult, AiVaultListSessionsInput } from '@yiru/runtime-protocol/ai-vault'
import { restampAiVaultListResult } from '~main/ai-vault/session/list-results'

import type { RpcContext } from '../core'

// Why: 切片 80 retired this leaf's legacy `defineMethod` registration —
// `orpc/router-direct/ai-vault.ts` wires this handler straight to the
// contract now. Kept as a plain export (not folded into that file) because
// it is also the shape `runtime.listAiVaultSessions` expects, matching the
// `hosted-review.ts`/`diagnostics.ts` precedent of leaving the handler beside
// the runtime call it wraps.
export async function listRuntimeAiVaultSessions(
  params: AiVaultListSessionsInput,
  { runtime }: RpcContext
): Promise<AiVaultListResult> {
  const result = await runtime.listAiVaultSessions({
    limit: params.limit,
    force: params.force,
    scopePaths: params.scopePaths
  })
  // Why: web clients consume this response directly (no parent-side retag),
  // so sessions must come back stamped as the runtime host they addressed.
  return params.executionHostId ? restampAiVaultListResult(result, params.executionHostId) : result
}
