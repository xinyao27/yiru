import {
  getProviderUsageMethodName,
  type ProviderUsageOperation,
  type ProviderUsageProvider,
  type ProviderUsageSnapshotInput,
  type ProviderUsageTypesByProvider
} from '@yiru/runtime-protocol/provider-usage'
import {
  createProviderUsageOperations,
  type ProviderUsageOperations
} from '~main/runtime/provider-usage/operations'
import { fetchRuntimeCursorUsage } from '~main/runtime/rpc/methods/provider-usage'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

type ProviderUsageImplementers = typeof runtimeImplementation.providerUsage

type ProviderUsageWiredHandlers<Provider extends ProviderUsageProvider> = {
  getScanState: ReturnType<
    typeof wireRuntimeMethod<void, ProviderUsageTypesByProvider[Provider]['scanState']>
  >
  setEnabled: ReturnType<
    typeof wireRuntimeMethod<
      { enabled: boolean },
      ProviderUsageTypesByProvider[Provider]['scanState']
    >
  >
  refresh: ReturnType<
    typeof wireRuntimeMethod<
      { force?: boolean },
      ProviderUsageTypesByProvider[Provider]['scanState']
    >
  >
  getSnapshot: ReturnType<
    typeof wireRuntimeMethod<
      ProviderUsageSnapshotInput,
      ProviderUsageTypesByProvider[Provider]['snapshot']
    >
  >
}

type ProviderUsageMountedHandlers<Provider extends ProviderUsageProvider> = {
  [Operation in ProviderUsageOperation]: ReturnType<
    ProviderUsageImplementers[Provider][Operation]['handler']
  >
}

type ProviderUsageDescriptor<Provider extends ProviderUsageProvider> = {
  provider: Provider
  operations: ProviderUsageOperations<
    ProviderUsageTypesByProvider[Provider]['scanState'],
    ProviderUsageTypesByProvider[Provider]['snapshot']
  >
  mount: (handlers: ProviderUsageWiredHandlers<Provider>) => ProviderUsageMountedHandlers<Provider>
}

function createProviderUsageHandlers<Provider extends ProviderUsageProvider>(
  descriptor: ProviderUsageDescriptor<Provider>
): ProviderUsageMountedHandlers<Provider> {
  const { operations, provider } = descriptor
  const handlers: ProviderUsageWiredHandlers<Provider> = {
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
  return descriptor.mount(handlers)
}

const providerUsage = {
  claude: createProviderUsageHandlers({
    provider: 'claude',
    operations: createProviderUsageOperations((context) =>
      context.runtime.providerUsage.getStore('claude')
    ),
    mount: (handlers) => ({
      getScanState: runtimeImplementation.providerUsage.claude.getScanState.handler(
        handlers.getScanState
      ),
      setEnabled: runtimeImplementation.providerUsage.claude.setEnabled.handler(
        handlers.setEnabled
      ),
      refresh: runtimeImplementation.providerUsage.claude.refresh.handler(handlers.refresh),
      getSnapshot: runtimeImplementation.providerUsage.claude.getSnapshot.handler(
        handlers.getSnapshot
      )
    })
  }),
  codex: createProviderUsageHandlers({
    provider: 'codex',
    operations: createProviderUsageOperations((context) =>
      context.runtime.providerUsage.getStore('codex')
    ),
    mount: (handlers) => ({
      getScanState: runtimeImplementation.providerUsage.codex.getScanState.handler(
        handlers.getScanState
      ),
      setEnabled: runtimeImplementation.providerUsage.codex.setEnabled.handler(handlers.setEnabled),
      refresh: runtimeImplementation.providerUsage.codex.refresh.handler(handlers.refresh),
      getSnapshot: runtimeImplementation.providerUsage.codex.getSnapshot.handler(
        handlers.getSnapshot
      )
    })
  }),
  openCode: createProviderUsageHandlers({
    provider: 'openCode',
    operations: createProviderUsageOperations((context) =>
      context.runtime.providerUsage.getStore('openCode')
    ),
    mount: (handlers) => ({
      getScanState: runtimeImplementation.providerUsage.openCode.getScanState.handler(
        handlers.getScanState
      ),
      setEnabled: runtimeImplementation.providerUsage.openCode.setEnabled.handler(
        handlers.setEnabled
      ),
      refresh: runtimeImplementation.providerUsage.openCode.refresh.handler(handlers.refresh),
      getSnapshot: runtimeImplementation.providerUsage.openCode.getSnapshot.handler(
        handlers.getSnapshot
      )
    })
  })
} satisfies {
  [Provider in ProviderUsageProvider]: ProviderUsageMountedHandlers<Provider>
}

export const providerUsageRuntimeHandlers = {
  usage: {
    cursor: runtimeImplementation.usage.cursor.handler(
      wireRuntimeMethod('usage.cursor', fetchRuntimeCursorUsage)
    )
  },
  providerUsage
} as const
