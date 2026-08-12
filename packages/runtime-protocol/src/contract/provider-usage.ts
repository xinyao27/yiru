import { type, type ContractRouter, type Schema } from '@orpc/contract'

import type {
  ClaudeUsageScanState,
  ClaudeUsageSnapshot,
  CodexUsageScanState,
  CodexUsageSnapshot,
  OpenCodeUsageScanState,
  OpenCodeUsageSnapshot,
  ProviderUsageProvider,
  ProviderUsageSnapshotInput
} from '../provider-usage.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { ProviderRateLimits } from './accounts.js'

const PROVIDER_USAGE_ACCESS = { scope: 'host', tier: 'read' } as const
const PROVIDER_USAGE_WRITE_ACCESS = { scope: 'host', tier: 'host' } as const

type ProviderUsageContractDescriptor<TScanState, TSnapshot> = {
  scanState: Schema<TScanState, TScanState>
  snapshot: Schema<TSnapshot, TSnapshot>
}

type ProviderUsageTypes = {
  claude: { scanState: ClaudeUsageScanState; snapshot: ClaudeUsageSnapshot }
  codex: { scanState: CodexUsageScanState; snapshot: CodexUsageSnapshot }
  openCode: { scanState: OpenCodeUsageScanState; snapshot: OpenCodeUsageSnapshot }
}

type ProviderUsageContractDescriptors = {
  [Provider in ProviderUsageProvider]: ProviderUsageContractDescriptor<
    ProviderUsageTypes[Provider]['scanState'],
    ProviderUsageTypes[Provider]['snapshot']
  >
}

function createProviderUsageContract<TScanState, TSnapshot>(
  descriptor: ProviderUsageContractDescriptor<TScanState, TSnapshot>
) {
  return {
    getScanState: withAccess(PROVIDER_USAGE_ACCESS)
      .input(type<void>())
      .output(descriptor.scanState),
    setEnabled: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
      .input(type<{ enabled: boolean }>())
      .output(descriptor.scanState),
    refresh: withAccess(PROVIDER_USAGE_WRITE_ACCESS)
      .input(type<{ force?: boolean }>())
      .output(descriptor.scanState),
    getSnapshot: withAccess(PROVIDER_USAGE_ACCESS)
      .input(type<ProviderUsageSnapshotInput>())
      .output(descriptor.snapshot)
  } satisfies ContractRouter<RuntimeProcedureMeta>
}

const providerUsageContractDescriptors = {
  claude: {
    scanState: type<ClaudeUsageScanState>(),
    snapshot: type<ClaudeUsageSnapshot>()
  },
  codex: {
    scanState: type<CodexUsageScanState>(),
    snapshot: type<CodexUsageSnapshot>()
  },
  openCode: {
    scanState: type<OpenCodeUsageScanState>(),
    snapshot: type<OpenCodeUsageSnapshot>()
  }
} as const satisfies ProviderUsageContractDescriptors

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
  claude: createProviderUsageContract(providerUsageContractDescriptors.claude),
  codex: createProviderUsageContract(providerUsageContractDescriptors.codex),
  openCode: createProviderUsageContract(providerUsageContractDescriptors.openCode)
} satisfies ContractRouter<RuntimeProcedureMeta>

export const cursorUsageContract = {
  cursor: withAccess(PROVIDER_USAGE_ACCESS).input(type<void>()).output(type<ProviderRateLimits>())
} satisfies ContractRouter<RuntimeProcedureMeta>
