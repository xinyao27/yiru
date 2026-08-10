import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { ProviderRateLimits } from './accounts.js'

const PROVIDER_USAGE_ACCESS = { scope: 'host', tier: 'read' } as const

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
  cursor: withAccess(PROVIDER_USAGE_ACCESS).input(type<void>()).output(type<ProviderRateLimits>())
} satisfies ContractRouter<RuntimeProcedureMeta>
