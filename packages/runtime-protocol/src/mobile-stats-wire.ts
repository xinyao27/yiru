import { z } from 'zod'

import type { RuntimeStatsSummary } from './mobile-runtime-types.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_STATS_SUMMARY_ORPC_PATH = '/stats/summary'

export const MobileStatsRangeSchema = z.enum(['7d', '30d', '90d'])
export const MobileStatsSummaryRequestSchema = z.object({
  refreshUsage: z.boolean().optional(),
  range: MobileStatsRangeSchema.optional()
})

const DailyActivitySchema = z.object({
  day: z.string(),
  agentStarts: z.number(),
  prsCreated: z.number()
})
const DailyTokensSchema = z.object({ day: z.string(), tokens: z.number() })
const DailyValueSchema = z.object({ day: z.string(), valueUsd: z.number() })
const ModelUsageSchema = z.object({
  key: z.string(),
  label: z.string(),
  tokens: z.number(),
  valueUsd: z.number().nullable()
})
const ProviderUsageSchema = z.object({
  provider: z.enum(['claude', 'codex', 'open-code']),
  tokens: z.number(),
  valueUsd: z.number().nullable()
})
const DailyProviderUsageSchema = z.object({
  day: z.string(),
  providers: z.array(ProviderUsageSchema)
})
const ProjectUsageSchema = z.object({
  key: z.string(),
  label: z.string(),
  sessions: z.number(),
  tokens: z.number(),
  valueUsd: z.number().nullable(),
  providers: z.array(ProviderUsageSchema)
})
const SupplementalDailyUsageSchema = DailyTokensSchema.extend({
  valueUsd: z.number().nullable(),
  unpricedTokens: z.number()
})
const SupplementalUsageSchema = z.object({
  dailyTokens: z.array(SupplementalDailyUsageSchema),
  modelUsage: z.array(ModelUsageSchema),
  meteredValueUsd: z.number().nullable().optional()
})

export const MobileStatsSummarySchema = z.object({
  totalAgentsSpawned: z.number().optional(),
  totalPRsCreated: z.number().optional(),
  totalAgentTimeMs: z.number().optional(),
  firstEventAt: z.number().nullable().optional(),
  dailyActivity: z.array(DailyActivitySchema).optional(),
  dailyTokens: z.array(DailyTokensSchema).optional(),
  dailyUnpricedTokens: z.array(DailyTokensSchema).optional(),
  tokenDataAvailable: z.boolean().optional(),
  tokenUnavailableAgents: z.array(z.string()).optional(),
  dailyValues: z.array(DailyValueSchema).optional(),
  modelUsage: z.array(ModelUsageSchema).optional(),
  dailyProviderUsage: z.array(DailyProviderUsageSchema).optional(),
  projectUsage: z.array(ProjectUsageSchema).optional(),
  usageRange: z.enum(['7d', '30d', '90d', 'all']).optional(),
  supplementalUsage: SupplementalUsageSchema.optional(),
  usageValueAvailable: z.boolean().optional(),
  hasUnpricedUsage: z.boolean().optional()
})

export const MOBILE_STATS_SUMMARY_WIRE_IS_COMPATIBLE: RuntimeStatsSummary extends z.infer<
  typeof MobileStatsSummarySchema
>
  ? true
  : false = true
