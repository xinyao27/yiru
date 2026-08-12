import type {
  ClaudeUsageScanState,
  ClaudeUsageSnapshot,
  CodexUsageScanState,
  CodexUsageSnapshot,
  OpenCodeUsageScanState,
  OpenCodeUsageSnapshot,
  UsageAnalyticsSnapshotInput
} from '@yiru/runtime-protocol/provider-analytics'
import { useAppStore } from '~renderer/store'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

function getUsageAnalyticsTarget(): ReturnType<typeof getActiveRuntimeTarget> {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export const claudeUsageClient = {
  getScanState: (): Promise<ClaudeUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.claude.getScanState,
      undefined
    ),
  setEnabled: (input: { enabled: boolean }): Promise<ClaudeUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.claude.setEnabled,
      input
    ),
  refresh: (input: { force?: boolean }): Promise<ClaudeUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.claude.refresh,
      input
    ),
  getSnapshot: (input: UsageAnalyticsSnapshotInput): Promise<ClaudeUsageSnapshot> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.claude.getSnapshot,
      input
    )
}

export const codexUsageClient = {
  getScanState: (): Promise<CodexUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.codex.getScanState,
      undefined
    ),
  setEnabled: (input: { enabled: boolean }): Promise<CodexUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.codex.setEnabled,
      input
    ),
  refresh: (input: { force?: boolean }): Promise<CodexUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.codex.refresh,
      input
    ),
  getSnapshot: (input: UsageAnalyticsSnapshotInput): Promise<CodexUsageSnapshot> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.codex.getSnapshot,
      input
    )
}

export const openCodeUsageClient = {
  getScanState: (): Promise<OpenCodeUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.openCode.getScanState,
      undefined
    ),
  setEnabled: (input: { enabled: boolean }): Promise<OpenCodeUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.openCode.setEnabled,
      input
    ),
  refresh: (input: { force?: boolean }): Promise<OpenCodeUsageScanState> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.openCode.refresh,
      input
    ),
  getSnapshot: (input: UsageAnalyticsSnapshotInput): Promise<OpenCodeUsageSnapshot> =>
    callRuntimeOrpc(
      getUsageAnalyticsTarget(),
      (client) => client.usage.analytics.openCode.getSnapshot,
      input
    )
}
