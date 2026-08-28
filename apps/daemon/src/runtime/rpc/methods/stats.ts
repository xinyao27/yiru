import type { StatsSummaryInput, StatsSummaryResult } from '@yiru/runtime-protocol/stats'

import type { RpcContext } from '../core'

export async function handleStatsSummary(
  params: StatsSummaryInput,
  { runtime }: RpcContext
): Promise<StatsSummaryResult> {
  return (
    (await runtime.getStatsSummary({
      refreshUsage: params.refreshUsage === true,
      ...(params.range === undefined ? {} : { range: params.range })
    })) ?? {}
  )
}
