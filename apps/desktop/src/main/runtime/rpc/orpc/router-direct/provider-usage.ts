import { fetchRuntimeCursorUsage } from '~main/runtime/rpc/methods/provider-usage'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: this leaf's only caller is main-process-to-main-process —
// `main/index.ts`'s `setRemoteCursorUsageFetcher()`, reaching a *different*
// paired Yiru host via `environment-transport-routing.ts`'s
// `callRuntimeEnvironment()`. That caller already passes the
// `CURSOR_USAGE_GET_CONTRACT` object rather than a bare method string, so
// 切片 79's contract-gated negotiation picks it up once the peer's oRPC
// tunnel is confirmed (see that file's own `Why:`). 切片 80 retires the
// legacy `defineMethod` registration this replaced.
export const providerUsageRuntimeHandlers = {
  usage: {
    cursor: runtimeImplementation.usage.cursor.handler(
      wireRuntimeMethod('usage.cursor', fetchRuntimeCursorUsage)
    )
  }
} as const
