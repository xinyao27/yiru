import { type, type ContractRouter, type Schema } from '@orpc/contract'

import type {
  ProviderUsageProvider,
  ProviderUsageSnapshotInput,
  ProviderUsageTypesByProvider
} from '../provider-usage.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { ProviderRateLimits } from './accounts.js'

const PROVIDER_USAGE_ACCESS = { scope: 'host', tier: 'read' } as const
const PROVIDER_USAGE_WRITE_ACCESS = { scope: 'host', tier: 'host' } as const

type ProviderUsageContractDescriptor<TScanState, TSnapshot> = {
  scanState: Schema<TScanState, TScanState>
  snapshot: Schema<TSnapshot, TSnapshot>
}

type ProviderUsageContractDescriptors = {
  [Provider in ProviderUsageProvider]: ProviderUsageContractDescriptor<
    ProviderUsageTypesByProvider[Provider]['scanState'],
    ProviderUsageTypesByProvider[Provider]['snapshot']
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
    scanState: type<ProviderUsageTypesByProvider['claude']['scanState']>(),
    snapshot: type<ProviderUsageTypesByProvider['claude']['snapshot']>()
  },
  codex: {
    scanState: type<ProviderUsageTypesByProvider['codex']['scanState']>(),
    snapshot: type<ProviderUsageTypesByProvider['codex']['snapshot']>()
  },
  openCode: {
    scanState: type<ProviderUsageTypesByProvider['openCode']['scanState']>(),
    snapshot: type<ProviderUsageTypesByProvider['openCode']['snapshot']>()
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
