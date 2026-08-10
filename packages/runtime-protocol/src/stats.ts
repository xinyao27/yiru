import { z } from 'zod'

import type { RuntimeStatsSummary } from './mobile-runtime-types'

export const StatsSummaryInputSchema = z.object({
  refreshUsage: z.boolean().optional()
})

export type StatsSummaryInput = z.infer<typeof StatsSummaryInputSchema>
export type StatsSummaryUnavailable = {
  [Key in keyof RuntimeStatsSummary]?: never
}
export type StatsSummaryResult = RuntimeStatsSummary | StatsSummaryUnavailable
