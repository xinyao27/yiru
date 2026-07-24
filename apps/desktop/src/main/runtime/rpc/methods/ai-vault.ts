import { AI_VAULT_LIST_SESSIONS_CONTRACT } from '../../../../shared/runtime-method-contracts/ai-vault-contracts'
import { restampAiVaultListResult } from '../../../ai-vault/session-list-results'
import { defineMethod, type RpcMethod } from '../core'

export const AI_VAULT_METHODS: RpcMethod[] = [
  defineMethod({
    contract: AI_VAULT_LIST_SESSIONS_CONTRACT,
    handler: async (params, { runtime }) => {
      const result = await runtime.listAiVaultSessions({
        limit: params.limit,
        force: params.force,
        scopePaths: params.scopePaths
      })
      // Why: web clients consume this response directly (no parent-side retag),
      // so sessions must come back stamped as the runtime host they addressed.
      return params.executionHostId
        ? restampAiVaultListResult(result, params.executionHostId)
        : result
    }
  })
]
