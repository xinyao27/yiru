import { createProviderUsageOperations } from '~main/runtime/provider-usage/operations'
import { fetchRuntimeCursorUsage } from '~main/runtime/rpc/methods/provider-usage'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

const claudeUsage = createProviderUsageOperations((context) =>
  context.runtime.providerUsage.getStore('claude')
)
const codexUsage = createProviderUsageOperations((context) =>
  context.runtime.providerUsage.getStore('codex')
)
const openCodeUsage = createProviderUsageOperations((context) =>
  context.runtime.providerUsage.getStore('openCode')
)

function providerUsageMethod(provider: string, operation: string): string {
  return `providerUsage.${provider}.${operation}`
}

export const providerUsageRuntimeHandlers = {
  usage: {
    cursor: runtimeImplementation.usage.cursor.handler(
      wireRuntimeMethod('usage.cursor', fetchRuntimeCursorUsage)
    )
  },
  providerUsage: {
    claude: {
      getScanState: runtimeImplementation.providerUsage.claude.getScanState.handler(
        wireRuntimeMethod(providerUsageMethod('claude', 'getScanState'), claudeUsage.getScanState)
      ),
      setEnabled: runtimeImplementation.providerUsage.claude.setEnabled.handler(
        wireRuntimeMethod(providerUsageMethod('claude', 'setEnabled'), claudeUsage.setEnabled)
      ),
      refresh: runtimeImplementation.providerUsage.claude.refresh.handler(
        wireRuntimeMethod(providerUsageMethod('claude', 'refresh'), claudeUsage.refresh)
      ),
      getSnapshot: runtimeImplementation.providerUsage.claude.getSnapshot.handler(
        wireRuntimeMethod(providerUsageMethod('claude', 'getSnapshot'), claudeUsage.getSnapshot)
      )
    },
    codex: {
      getScanState: runtimeImplementation.providerUsage.codex.getScanState.handler(
        wireRuntimeMethod(providerUsageMethod('codex', 'getScanState'), codexUsage.getScanState)
      ),
      setEnabled: runtimeImplementation.providerUsage.codex.setEnabled.handler(
        wireRuntimeMethod(providerUsageMethod('codex', 'setEnabled'), codexUsage.setEnabled)
      ),
      refresh: runtimeImplementation.providerUsage.codex.refresh.handler(
        wireRuntimeMethod(providerUsageMethod('codex', 'refresh'), codexUsage.refresh)
      ),
      getSnapshot: runtimeImplementation.providerUsage.codex.getSnapshot.handler(
        wireRuntimeMethod(providerUsageMethod('codex', 'getSnapshot'), codexUsage.getSnapshot)
      )
    },
    openCode: {
      getScanState: runtimeImplementation.providerUsage.openCode.getScanState.handler(
        wireRuntimeMethod(
          providerUsageMethod('openCode', 'getScanState'),
          openCodeUsage.getScanState
        )
      ),
      setEnabled: runtimeImplementation.providerUsage.openCode.setEnabled.handler(
        wireRuntimeMethod(providerUsageMethod('openCode', 'setEnabled'), openCodeUsage.setEnabled)
      ),
      refresh: runtimeImplementation.providerUsage.openCode.refresh.handler(
        wireRuntimeMethod(providerUsageMethod('openCode', 'refresh'), openCodeUsage.refresh)
      ),
      getSnapshot: runtimeImplementation.providerUsage.openCode.getSnapshot.handler(
        wireRuntimeMethod(providerUsageMethod('openCode', 'getSnapshot'), openCodeUsage.getSnapshot)
      )
    }
  }
} as const
