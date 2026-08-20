import { z } from 'zod'

import type {
  AccountsSnapshot,
  AccountsSubscriptionEvent,
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState,
  SelectAccountInput
} from './contract/accounts.js' with { 'resolution-mode': 'import' }

export const MOBILE_ACCOUNTS_LIST_ORPC_PATH = '/accounts/list'
export const MOBILE_ACCOUNTS_SELECT_CLAUDE_ORPC_PATH = '/accounts/selectClaude'
export const MOBILE_ACCOUNTS_SELECT_CODEX_ORPC_PATH = '/accounts/selectCodex'
export const MOBILE_ACCOUNTS_SUBSCRIBE_ORPC_PATH = '/accounts/subscribe'

const MobileAccountSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  organizationName: z.string().nullable().optional(),
  workspaceLabel: z.string().nullable().optional()
})

const MobileAccountRosterSchema = z.object({
  accounts: z.array(MobileAccountSummarySchema),
  activeAccountId: z.string().nullable()
})

const MobileRateLimitWindowSchema = z.object({
  usedPercent: z.number(),
  windowMinutes: z.number(),
  resetsAt: z.number().nullable(),
  resetDescription: z.string().nullable()
})

const MobileRateLimitBucketSchema = MobileRateLimitWindowSchema.extend({ name: z.string() })

const MobileProviderRateLimitsSchema = z.object({
  provider: z.enum([
    'claude',
    'codex',
    'cursor',
    'gemini',
    'opencode-go',
    'kimi',
    'minimax',
    'grok',
    'antigravity'
  ]),
  session: MobileRateLimitWindowSchema.nullable(),
  weekly: MobileRateLimitWindowSchema.nullable(),
  fableWeekly: MobileRateLimitWindowSchema.nullable().optional(),
  monthly: MobileRateLimitWindowSchema.nullable().optional(),
  buckets: z.array(MobileRateLimitBucketSchema).optional(),
  planType: z.string().nullable().optional(),
  updatedAt: z.number(),
  error: z.string().nullable(),
  status: z.enum(['idle', 'fetching', 'ok', 'error', 'unavailable'])
})

const MobileInactiveAccountUsageSchema = z.object({
  accountId: z.string(),
  rateLimits: MobileProviderRateLimitsSchema.nullable(),
  updatedAt: z.number(),
  isFetching: z.boolean()
})

const MobileRateLimitStateSchema = z.object({
  claude: MobileProviderRateLimitsSchema.nullable(),
  codex: MobileProviderRateLimitsSchema.nullable(),
  cursor: MobileProviderRateLimitsSchema.nullable().optional(),
  gemini: MobileProviderRateLimitsSchema.nullable().optional(),
  opencodeGo: MobileProviderRateLimitsSchema.nullable().optional(),
  kimi: MobileProviderRateLimitsSchema.nullable().optional(),
  antigravity: MobileProviderRateLimitsSchema.nullable().optional(),
  minimax: MobileProviderRateLimitsSchema.nullable().optional(),
  grok: MobileProviderRateLimitsSchema.nullable().optional(),
  inactiveClaudeAccounts: z.array(MobileInactiveAccountUsageSchema),
  inactiveCodexAccounts: z.array(MobileInactiveAccountUsageSchema)
})

export const MobileAccountsSnapshotSchema = z.object({
  claude: MobileAccountRosterSchema,
  codex: MobileAccountRosterSchema,
  rateLimits: MobileRateLimitStateSchema
})

export const MobileAccountsSelectRequestSchema = z.object({
  accountId: z.string().min(1).nullable()
})

export const MobileAccountsSelectionResultSchema = MobileAccountRosterSchema

export const MobileAccountsSubscriptionEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    subscriptionId: z.string(),
    snapshot: MobileAccountsSnapshotSchema
  }),
  z.object({ type: z.literal('snapshot'), snapshot: MobileAccountsSnapshotSchema }),
  z.object({ type: z.literal('end') })
])

export const MOBILE_ACCOUNTS_SNAPSHOT_WIRE_IS_COMPATIBLE: AccountsSnapshot extends z.infer<
  typeof MobileAccountsSnapshotSchema
>
  ? true
  : false = true

export const MOBILE_ACCOUNTS_EVENT_WIRE_IS_COMPATIBLE: AccountsSubscriptionEvent extends z.infer<
  typeof MobileAccountsSubscriptionEventSchema
>
  ? true
  : false = true

export const MOBILE_ACCOUNTS_SELECT_REQUEST_WIRE_IS_COMPATIBLE: z.infer<
  typeof MobileAccountsSelectRequestSchema
> extends SelectAccountInput
  ? true
  : false = true

export const MOBILE_CLAUDE_SELECTION_WIRE_IS_COMPATIBLE: ClaudeRateLimitAccountsState extends z.infer<
  typeof MobileAccountsSelectionResultSchema
>
  ? true
  : false = true

export const MOBILE_CODEX_SELECTION_WIRE_IS_COMPATIBLE: CodexRateLimitAccountsState extends z.infer<
  typeof MobileAccountsSelectionResultSchema
>
  ? true
  : false = true
