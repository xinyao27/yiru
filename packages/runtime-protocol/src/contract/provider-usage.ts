import { type, type ContractRouter } from '@orpc/contract'

import type {
  ClaudeUsageScanState,
  ClaudeUsageSnapshot,
  CodexUsageScanState,
  CodexUsageSnapshot,
  OpenCodeUsageScanState,
  OpenCodeUsageSnapshot,
  UsageAnalyticsSnapshotInput
} from '../provider-analytics.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { ProviderRateLimits } from './accounts.js'

const PROVIDER_USAGE_ACCESS = { scope: 'host', tier: 'read' } as const
const PROVIDER_USAGE_WRITE_ACCESS = { scope: 'host', tier: 'host' } as const

const ClaudeUsageAnalyticsContract = {
  getScanState: withAccess(PROVIDER_USAGE_ACCESS)
    .input(type<void>())
    .output(type<ClaudeUsageScanState>()),
  setEnabled: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
    .input(type<{ enabled: boolean }>())
    .output(type<ClaudeUsageScanState>()),
  refresh: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
    .input(type<{ force?: boolean }>())
    .output(type<ClaudeUsageScanState>()),
  getSnapshot: withAccess(PROVIDER_USAGE_ACCESS)
    .input(type<UsageAnalyticsSnapshotInput>())
    .output(type<ClaudeUsageSnapshot>())
} satisfies ContractRouter<RuntimeProcedureMeta>

const CodexUsageAnalyticsContract = {
  getScanState: withAccess(PROVIDER_USAGE_ACCESS)
    .input(type<void>())
    .output(type<CodexUsageScanState>()),
  setEnabled: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
    .input(type<{ enabled: boolean }>())
    .output(type<CodexUsageScanState>()),
  refresh: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
    .input(type<{ force?: boolean }>())
    .output(type<CodexUsageScanState>()),
  getSnapshot: withAccess(PROVIDER_USAGE_ACCESS)
    .input(type<UsageAnalyticsSnapshotInput>())
    .output(type<CodexUsageSnapshot>())
} satisfies ContractRouter<RuntimeProcedureMeta>

const OpenCodeUsageAnalyticsContract = {
  getScanState: withAccess(PROVIDER_USAGE_ACCESS)
    .input(type<void>())
    .output(type<OpenCodeUsageScanState>()),
  setEnabled: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
    .input(type<{ enabled: boolean }>())
    .output(type<OpenCodeUsageScanState>()),
  refresh: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
    .input(type<{ force?: boolean }>())
    .output(type<OpenCodeUsageScanState>()),
  getSnapshot: withAccess(PROVIDER_USAGE_ACCESS)
    .input(type<UsageAnalyticsSnapshotInput>())
    .output(type<OpenCodeUsageSnapshot>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export type CursorUsageLegacyContract = Readonly<{
  name: 'usage.cursor'
  params: null
  mobile: false
  resultType?: ProviderRateLimits
}>

export const CURSOR_USAGE_GET_CONTRACT: CursorUsageLegacyContract = {
  name: 'usage.cursor',
  params: null,
  mobile: false
}

export const providerUsageContract = {
  cursor: withAccess(PROVIDER_USAGE_ACCESS).input(type<void>()).output(type<ProviderRateLimits>()),
  analytics: {
    claude: ClaudeUsageAnalyticsContract,
    codex: CodexUsageAnalyticsContract,
    openCode: OpenCodeUsageAnalyticsContract
  }
} satisfies ContractRouter<RuntimeProcedureMeta>
