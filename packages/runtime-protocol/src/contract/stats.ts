import { type, type ContractRouter } from '@orpc/contract'

import { StatsSummaryInputSchema, type StatsSummaryResult } from '../stats.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const STATS_ACCESS = { scope: 'host', tier: 'read' } as const
const STATS_CLIENTS = { mobile: true } as const

export const statsContract = {
  summary: withAccess(STATS_ACCESS, STATS_CLIENTS)
    .input(StatsSummaryInputSchema)
    .output(type<StatsSummaryResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export { StatsSummaryInputSchema } from '../stats.js'
export type { StatsSummaryInput, StatsSummaryResult, StatsSummaryUnavailable } from '../stats.js'
