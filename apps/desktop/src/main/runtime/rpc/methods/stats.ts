import { z } from 'zod'

import { defineMethod, type RpcMethod } from '../core'

const StatsSummaryParams = z.object({
  refreshUsage: z.boolean().optional()
})

export const STATS_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'stats.summary',
    mobile: true,
    params: StatsSummaryParams,
    access: { scope: 'host', tier: 'read' },
    handler: async (params, { runtime }) => {
      return (await runtime.getStatsSummary(params.refreshUsage === true)) ?? {}
    }
  })
]
