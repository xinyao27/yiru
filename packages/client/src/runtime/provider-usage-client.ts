import type {
  ClaudeUsageScanState,
  ClaudeUsageSnapshot,
  CodexUsageScanState,
  CodexUsageSnapshot,
  OpenCodeUsageScanState,
  OpenCodeUsageSnapshot,
  ProviderUsageSnapshotInput
} from '@yiru/runtime-protocol/provider-usage'
import { useAppStore } from '~renderer/store/state'

import {
  callRuntimeOrpc,
  type RuntimeOrpcClient,
  type RuntimeOrpcClientContext
} from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

type ProviderUsageProcedure<TInput, TOutput> = (
  input: TInput,
  options?: { signal?: AbortSignal; context?: RuntimeOrpcClientContext }
) => Promise<TOutput>

type ProviderUsageProcedures<TScanState, TSnapshot> = {
  getScanState: ProviderUsageProcedure<void, TScanState>
  setEnabled: ProviderUsageProcedure<{ enabled: boolean }, TScanState>
  refresh: ProviderUsageProcedure<{ force?: boolean }, TScanState>
  getSnapshot: ProviderUsageProcedure<ProviderUsageSnapshotInput, TSnapshot>
}

function getProviderUsageTarget(): ReturnType<typeof getActiveRuntimeTarget> {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

function createProviderUsageClient<TScanState, TSnapshot>(
  select: (client: RuntimeOrpcClient) => ProviderUsageProcedures<TScanState, TSnapshot>
) {
  return {
    getScanState: (): Promise<TScanState> =>
      callRuntimeOrpc(getProviderUsageTarget(), (client) => select(client).getScanState, undefined),
    setEnabled: (input: { enabled: boolean }): Promise<TScanState> =>
      callRuntimeOrpc(getProviderUsageTarget(), (client) => select(client).setEnabled, input),
    refresh: (input: { force?: boolean }): Promise<TScanState> =>
      callRuntimeOrpc(getProviderUsageTarget(), (client) => select(client).refresh, input),
    getSnapshot: (input: ProviderUsageSnapshotInput): Promise<TSnapshot> =>
      callRuntimeOrpc(getProviderUsageTarget(), (client) => select(client).getSnapshot, input)
  }
}

export const claudeProviderUsageClient = createProviderUsageClient<
  ClaudeUsageScanState,
  ClaudeUsageSnapshot
>((client) => client.providerUsage.claude)

export const codexProviderUsageClient = createProviderUsageClient<
  CodexUsageScanState,
  CodexUsageSnapshot
>((client) => client.providerUsage.codex)

export const openCodeProviderUsageClient = createProviderUsageClient<
  OpenCodeUsageScanState,
  OpenCodeUsageSnapshot
>((client) => client.providerUsage.openCode)
