import { z } from 'zod'

import type { RuntimeStatsSummary } from './mobile-runtime-types'
import { STATS_USAGE_RANGES } from './stats-usage-range'

export const StatsSummaryInputSchema = z.object({
  refreshUsage: z.boolean().optional(),
  // Why: mobile reads the whole summary over one call, so the usage window is
  // part of the query; an older host ignores it and echoes its own range back.
  range: z.enum(STATS_USAGE_RANGES).optional()
})

export type StatsSummaryInput = z.infer<typeof StatsSummaryInputSchema>
export type StatsSummaryUnavailable = {
  [Key in keyof RuntimeStatsSummary]?: never
}
export type StatsSummaryResult = RuntimeStatsSummary | StatsSummaryUnavailable
