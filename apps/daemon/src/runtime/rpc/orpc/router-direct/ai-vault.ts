import { listRuntimeAiVaultSessions } from '~main/runtime/rpc/methods/ai-vault'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: this leaf's only caller outside the always-oRPC renderer/web/CLI
// clients is main-process-to-main-process — `runtime-session-scanner.ts`'s
// `scanRuntimeAiVaultSessions()`, reaching a *different* paired Yiru host via
// `environment-transport-routing.ts`'s `callRuntimeEnvironment()`. That
// caller already passes the `AI_VAULT_LIST_SESSIONS_CONTRACT` object rather
// than a bare method string, so 切片 79's contract-gated negotiation picks it
// up once the peer's oRPC tunnel is confirmed (see that file's own `Why:`).
// 切片 80 retires the legacy `defineMethod` registration this replaced.
export const aiVaultRuntimeHandlers = {
  aiVault: {
    listSessions: runtimeImplementation.aiVault.listSessions.handler(
      wireRuntimeMethod('aiVault.listSessions', listRuntimeAiVaultSessions)
    )
  }
} as const
