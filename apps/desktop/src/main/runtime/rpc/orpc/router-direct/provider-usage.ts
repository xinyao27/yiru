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
    ),
    analytics: {
      claude: {
        getScanState: runtimeImplementation.usage.analytics.claude.getScanState.handler(
          wireRuntimeMethod('usage.analytics.claude.getScanState', async (_input, context) =>
            context.runtime.getStatsUsageStores().claude.getScanState()
          )
        ),
        setEnabled: runtimeImplementation.usage.analytics.claude.setEnabled.handler(
          wireRuntimeMethod('usage.analytics.claude.setEnabled', async (input, context) =>
            context.runtime.getStatsUsageStores().claude.setEnabled(input.enabled)
          )
        ),
        refresh: runtimeImplementation.usage.analytics.claude.refresh.handler(
          wireRuntimeMethod('usage.analytics.claude.refresh', async (input, context) =>
            context.runtime.getStatsUsageStores().claude.refresh(input.force)
          )
        ),
        getSnapshot: runtimeImplementation.usage.analytics.claude.getSnapshot.handler(
          wireRuntimeMethod('usage.analytics.claude.getSnapshot', async (input, context) =>
            context.runtime
              .getStatsUsageStores()
              .claude.getSnapshot(input.scope, input.range, input.limit)
          )
        )
      },
      codex: {
        getScanState: runtimeImplementation.usage.analytics.codex.getScanState.handler(
          wireRuntimeMethod('usage.analytics.codex.getScanState', async (_input, context) =>
            context.runtime.getStatsUsageStores().codex.getScanState()
          )
        ),
        setEnabled: runtimeImplementation.usage.analytics.codex.setEnabled.handler(
          wireRuntimeMethod('usage.analytics.codex.setEnabled', async (input, context) =>
            context.runtime.getStatsUsageStores().codex.setEnabled(input.enabled)
          )
        ),
        refresh: runtimeImplementation.usage.analytics.codex.refresh.handler(
          wireRuntimeMethod('usage.analytics.codex.refresh', async (input, context) =>
            context.runtime.getStatsUsageStores().codex.refresh(input.force)
          )
        ),
        getSnapshot: runtimeImplementation.usage.analytics.codex.getSnapshot.handler(
          wireRuntimeMethod('usage.analytics.codex.getSnapshot', async (input, context) =>
            context.runtime
              .getStatsUsageStores()
              .codex.getSnapshot(input.scope, input.range, input.limit)
          )
        )
      },
      openCode: {
        getScanState: runtimeImplementation.usage.analytics.openCode.getScanState.handler(
          wireRuntimeMethod('usage.analytics.openCode.getScanState', async (_input, context) =>
            context.runtime.getStatsUsageStores().openCode.getScanState()
          )
        ),
        setEnabled: runtimeImplementation.usage.analytics.openCode.setEnabled.handler(
          wireRuntimeMethod('usage.analytics.openCode.setEnabled', async (input, context) =>
            context.runtime.getStatsUsageStores().openCode.setEnabled(input.enabled)
          )
        ),
        refresh: runtimeImplementation.usage.analytics.openCode.refresh.handler(
          wireRuntimeMethod('usage.analytics.openCode.refresh', async (input, context) =>
            context.runtime.getStatsUsageStores().openCode.refresh(input.force)
          )
        ),
        getSnapshot: runtimeImplementation.usage.analytics.openCode.getSnapshot.handler(
          wireRuntimeMethod('usage.analytics.openCode.getSnapshot', async (input, context) =>
            context.runtime
              .getStatsUsageStores()
              .openCode.getSnapshot(input.scope, input.range, input.limit)
          )
        )
      }
    }
  }
} as const
