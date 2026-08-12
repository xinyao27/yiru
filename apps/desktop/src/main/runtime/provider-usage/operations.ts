import type { ProviderUsageSnapshotInput } from '@yiru/runtime-protocol/provider-usage'

import type { RpcContext } from '../rpc/core'

type ProviderUsageStore<TScanState, TSnapshot> = {
  getScanState: () => TScanState
  setEnabled: (enabled: boolean) => Promise<TScanState>
  refresh: (force?: boolean) => Promise<TScanState>
  getSnapshot: (
    scope: 'yiru' | 'all',
    range: '7d' | '30d' | '90d' | 'all',
    limit?: number
  ) => TSnapshot
}

export type ProviderUsageOperations<TScanState, TSnapshot> = {
  getScanState: (_input: void, context: RpcContext) => TScanState
  setEnabled: (input: { enabled: boolean }, context: RpcContext) => Promise<TScanState>
  refresh: (input: { force?: boolean }, context: RpcContext) => Promise<TScanState>
  getSnapshot: (input: ProviderUsageSnapshotInput, context: RpcContext) => TSnapshot
}

export function createProviderUsageOperations<TScanState, TSnapshot>(
  getStore: (context: RpcContext) => ProviderUsageStore<TScanState, TSnapshot>
): ProviderUsageOperations<TScanState, TSnapshot> {
  return {
    getScanState: (_input: void, context: RpcContext): TScanState =>
      getStore(context).getScanState(),
    setEnabled: (input: { enabled: boolean }, context: RpcContext): Promise<TScanState> =>
      getStore(context).setEnabled(input.enabled),
    refresh: (input: { force?: boolean }, context: RpcContext): Promise<TScanState> =>
      getStore(context).refresh(input.force),
    getSnapshot: (input: ProviderUsageSnapshotInput, context: RpcContext): TSnapshot =>
      getStore(context).getSnapshot(input.scope, input.range, input.limit)
  }
}
