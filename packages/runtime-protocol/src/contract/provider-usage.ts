import { type, type ContractRouter } from '@orpc/contract'

import type {
  ClaudeUsageScanState,
  ClaudeUsageSnapshot,
  CodexUsageScanState,
  CodexUsageSnapshot,
  OpenCodeUsageScanState,
  OpenCodeUsageSnapshot,
  ProviderUsageSnapshotInput
} from '../provider-usage.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { ProviderRateLimits } from './accounts.js'

const PROVIDER_USAGE_ACCESS = { scope: 'host', tier: 'read' } as const
const PROVIDER_USAGE_WRITE_ACCESS = { scope: 'host', tier: 'host' } as const

const claudeProviderUsageContract = {
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
    .input(type<ProviderUsageSnapshotInput>())
    .output(type<ClaudeUsageSnapshot>())
} satisfies ContractRouter<RuntimeProcedureMeta>

const codexProviderUsageContract = {
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
    .input(type<ProviderUsageSnapshotInput>())
    .output(type<CodexUsageSnapshot>())
} satisfies ContractRouter<RuntimeProcedureMeta>

const openCodeProviderUsageContract = {
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
    .input(type<ProviderUsageSnapshotInput>())
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
  claude: claudeProviderUsageContract,
  codex: codexProviderUsageContract,
  openCode: openCodeProviderUsageContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export const cursorUsageContract = {
  cursor: withAccess(PROVIDER_USAGE_ACCESS).input(type<void>()).output(type<ProviderRateLimits>())
} satisfies ContractRouter<RuntimeProcedureMeta>
