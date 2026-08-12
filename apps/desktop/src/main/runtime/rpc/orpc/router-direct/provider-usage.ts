import {
  getProviderUsageMethodName,
  PROVIDER_USAGE_OPERATIONS,
  type ProviderUsageOperation,
  type ProviderUsageProvider
} from '@yiru/runtime-protocol/provider-usage'
import {
  createProviderUsageOperations,
  type ProviderUsageOperations
} from '~main/runtime/provider-usage/operations'
import { fetchRuntimeCursorUsage } from '~main/runtime/rpc/methods/provider-usage'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

function createProviderUsageHandlers<TScanState, TSnapshot>(
  provider: ProviderUsageProvider,
  implementation: object,
  operations: ProviderUsageOperations<TScanState, TSnapshot>
) {
  const wired = {
    getScanState: wireRuntimeMethod(
      getProviderUsageMethodName(provider, 'getScanState'),
      operations.getScanState
    ),
    setEnabled: wireRuntimeMethod(
      getProviderUsageMethodName(provider, 'setEnabled'),
      operations.setEnabled
    ),
    refresh: wireRuntimeMethod(getProviderUsageMethodName(provider, 'refresh'), operations.refresh),
    getSnapshot: wireRuntimeMethod(
      getProviderUsageMethodName(provider, 'getSnapshot'),
      operations.getSnapshot
    )
  }
  return Object.fromEntries(
    PROVIDER_USAGE_OPERATIONS.map((operation) => [
      operation,
      implementProviderUsageOperation(implementation, operation, wired[operation])
    ])
  )
}

function implementProviderUsageOperation(
  implementation: object,
  operation: ProviderUsageOperation,
  handler: unknown
): unknown {
  const procedure = Reflect.get(implementation, operation)
  if (procedure === null || typeof procedure !== 'object') {
    throw new Error(`missing_provider_usage_implementer:${operation}`)
  }
  const bind = Reflect.get(procedure, 'handler')
  if (typeof bind !== 'function') {
    throw new Error(`invalid_provider_usage_implementer:${operation}`)
  }
  // Why: each provider has the same operation inputs but distinct outputs, which
  // makes oRPC's indexed implementer a handler intersection. The typed operation
  // factory validates outputs before this closed, runtime-checked mount step.
  return Reflect.apply(bind, procedure, [handler])
}

const providerUsage = {
  claude: createProviderUsageHandlers(
    'claude',
    runtimeImplementation.providerUsage.claude,
    createProviderUsageOperations((context) => context.runtime.providerUsage.getStore('claude'))
  ),
  codex: createProviderUsageHandlers(
    'codex',
    runtimeImplementation.providerUsage.codex,
    createProviderUsageOperations((context) => context.runtime.providerUsage.getStore('codex'))
  ),
  openCode: createProviderUsageHandlers(
    'openCode',
    runtimeImplementation.providerUsage.openCode,
    createProviderUsageOperations((context) => context.runtime.providerUsage.getStore('openCode'))
  )
} satisfies Record<ProviderUsageProvider, object>

export const providerUsageRuntimeHandlers = {
  usage: {
    cursor: runtimeImplementation.usage.cursor.handler(
      wireRuntimeMethod('usage.cursor', fetchRuntimeCursorUsage)
    )
  },
  providerUsage
} as const
