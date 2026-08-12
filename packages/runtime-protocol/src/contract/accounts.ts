import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type ManagedAccountRuntimeSelection = {
  host: string | null
  wsl: Record<string, string | null>
}

export type ClaudeManagedAccountSummary = {
  id: string
  email: string
  managedAuthRuntime?: 'host' | 'wsl'
  wslDistro?: string | null
  authMethod: 'subscription-oauth' | 'unknown'
  organizationUuid?: string | null
  organizationName?: string | null
  createdAt: number
  updatedAt: number
  lastAuthenticatedAt: number
}

export type ClaudeRateLimitAccountsState = {
  accounts: ClaudeManagedAccountSummary[]
  activeAccountId: string | null
  activeAccountIdsByRuntime?: ManagedAccountRuntimeSelection
}

export type CodexManagedAccountSummary = {
  id: string
  email: string
  managedHomeRuntime?: 'host' | 'wsl'
  wslDistro?: string | null
  providerAccountId?: string | null
  workspaceLabel?: string | null
  workspaceAccountId?: string | null
  createdAt: number
  updatedAt: number
  lastAuthenticatedAt: number
}

export type CodexSystemDefaultIdentity = {
  hasAuth: boolean
  authKind: 'oauth' | 'api-key' | 'none'
  email: string | null
  providerAccountId: string | null
  workspaceLabel: string | null
}

export type CodexRateLimitAccountsState = {
  accounts: CodexManagedAccountSummary[]
  activeAccountId: string | null
  activeAccountIdsByRuntime?: ManagedAccountRuntimeSelection
  systemDefault?: CodexSystemDefaultIdentity
}

export type RateLimitWindow = {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
  resetDescription: string | null
}

export type UsageRateLimitSource = 'oauth' | 'cli' | 'web'

export type UsageRateLimitFailureKind =
  | 'missing-credentials'
  | 'stale-token'
  | 'refreshable-credentials-without-token'
  | 'delegated-refresh-required'
  | 'deferred-by-live-session'
  | 'keychain-unavailable'
  | 'missing-scope'
  | 'network'
  | 'server'
  | 'parse'
  | 'rate-limited'
  | 'cli-unavailable'
  | 'usage-unavailable'
  | 'unknown'

export type UsageRateLimitMetadata = {
  source?: UsageRateLimitSource
  attemptedSources?: UsageRateLimitSource[]
  failureKind?: UsageRateLimitFailureKind
  credentialSource?: string
  authProvenance?: string
  deferredByLiveClaudeSession?: boolean
  lastSuccessfulSource?: UsageRateLimitSource
}

export type ProviderRateLimits = {
  provider:
    | 'claude'
    | 'codex'
    | 'cursor'
    | 'gemini'
    | 'opencode-go'
    | 'kimi'
    | 'minimax'
    | 'grok'
    | 'antigravity'
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  fableWeekly?: RateLimitWindow | null
  monthly?: RateLimitWindow | null
  buckets?: (RateLimitWindow & { name: string })[]
  rateLimitResetCredits?: {
    availableCount: number
    totalEarnedCount?: number
    nextExpiresAt?: number | null
    credits?: {
      status: string
      expiresAt: number | null
      grantedAt: number | null
    }[]
  } | null
  planType?: string | null
  updatedAt: number
  error: string | null
  status: 'idle' | 'fetching' | 'ok' | 'error' | 'unavailable'
  usageMetadata?: UsageRateLimitMetadata
}

export type RateLimitRuntimeTarget = {
  runtime: 'host' | 'wsl'
  wslDistro: string | null
}

export type CodexRateLimitResetOutcome = 'reset' | 'nothingToReset' | 'noCredit' | 'alreadyRedeemed'

export type CodexRateLimitResetResult = {
  outcome: CodexRateLimitResetOutcome
  state: RateLimitState
}

export type InactiveAccountUsage = {
  accountId: string
  rateLimits: ProviderRateLimits | null
  updatedAt: number
  isFetching: boolean
}

export type RateLimitState = {
  claude: ProviderRateLimits | null
  codex: ProviderRateLimits | null
  cursor: ProviderRateLimits | null
  gemini: ProviderRateLimits | null
  opencodeGo: ProviderRateLimits | null
  kimi: ProviderRateLimits | null
  antigravity: ProviderRateLimits | null
  minimax: ProviderRateLimits | null
  grok: ProviderRateLimits | null
  minimaxCookieConfigured: boolean
  grokAuthConfigured: boolean
  claudeTarget: RateLimitRuntimeTarget
  codexTarget: RateLimitRuntimeTarget
  inactiveClaudeAccounts: InactiveAccountUsage[]
  inactiveCodexAccounts: InactiveAccountUsage[]
}

export type AccountsSnapshot = {
  claude: ClaudeRateLimitAccountsState
  codex: CodexRateLimitAccountsState
  rateLimits: RateLimitState
}

// Why: mirrors the desktop `GrokAccountStatus` shared type structurally —
// this client-safe package cannot import apps/desktop's `~shared` types.
export type GrokAccountStatus = {
  signedIn: boolean
  email: string | null
  teamId: string | null
  tokenFresh: boolean
  error: string | null
}

export type AccountsSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string; snapshot: AccountsSnapshot }
  | { type: 'snapshot'; snapshot: AccountsSnapshot }
  | { type: 'end' }

export const SelectAccountInputSchema = z.object({
  accountId: z
    .union([z.string().min(1, 'Missing accountId'), z.null()])
    .transform((value) => (value === null ? null : value)),
  // Why: managed accounts are scoped per execution runtime (host OS vs a
  // specific WSL distro) on the same machine, not per physical host — the
  // preload `claudeAccounts.select` / `codexAccounts.select` members already
  // accept these so a caller can switch the active account for one runtime
  // without touching another's selection.
  runtime: z.enum(['host', 'wsl']).optional(),
  wslDistro: z.string().nullable().optional()
})

export const RemoveAccountInputSchema = z.object({
  accountId: z.string().min(1, 'Missing accountId')
})

export const AccountsUnsubscribeInputSchema = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

// Why: mirrors the desktop `RateLimitRuntimeTarget` shape used by
// `accounts.refreshCodexForTarget`/`refreshClaudeForTarget` — callers always
// pass a fully-resolved target, unlike SelectAccountInputSchema's optional
// runtime/wslDistro which lets a caller leave selection to the service.
export const RateLimitRuntimeTargetInputSchema = z.object({
  runtime: z.enum(['host', 'wsl']),
  wslDistro: z.string().nullable()
})

export const CursorRateLimitRefreshContextSchema = z.object({
  executionHostId: z.string().min(1),
  workspaceId: z.string().nullable()
})

export const RefreshRateLimitsInputSchema = z.object({
  cursorContext: CursorRateLimitRefreshContextSchema.nullable().optional()
})

export type RateLimitRuntimeTargetInput = z.output<typeof RateLimitRuntimeTargetInputSchema>
export type RefreshRateLimitsInput = z.output<typeof RefreshRateLimitsInputSchema>
export type SelectAccountInput = z.output<typeof SelectAccountInputSchema>
export type RemoveAccountInput = z.output<typeof RemoveAccountInputSchema>
export type AccountsUnsubscribeInput = z.output<typeof AccountsUnsubscribeInputSchema>

const ACCOUNTS_ACCESS = { scope: 'host', tier: 'host' } as const
const ACCOUNTS_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const accountsContract = {
  // Why: the settings pane needs the services' cached rosters without the
  // provider usage refresh performed by `list`. Keep the providers separate
  // so one damaged local credential store cannot hide the healthy roster.
  listCachedClaude: withAccess(ACCOUNTS_READ_ACCESS)
    .input(z.void())
    .output(type<ClaudeRateLimitAccountsState>()),
  listCachedCodex: withAccess(ACCOUNTS_READ_ACCESS)
    .input(z.void())
    .output(type<CodexRateLimitAccountsState>()),
  subscribe: withAccess(ACCOUNTS_ACCESS, MOBILE_CLIENT)
    .input(z.void())
    .output(eventIterator(type<AccountsSubscriptionEvent>())),
  list: withAccess(ACCOUNTS_ACCESS, MOBILE_CLIENT).input(z.void()).output(type<AccountsSnapshot>()),
  selectClaude: withAccess(ACCOUNTS_ACCESS, MOBILE_CLIENT)
    .input(SelectAccountInputSchema)
    .output(type<ClaudeRateLimitAccountsState>()),
  selectCodex: withAccess(ACCOUNTS_ACCESS, MOBILE_CLIENT)
    .input(SelectAccountInputSchema)
    .output(type<CodexRateLimitAccountsState>()),
  removeClaude: withAccess(ACCOUNTS_ACCESS)
    .input(RemoveAccountInputSchema)
    .output(type<ClaudeRateLimitAccountsState>()),
  removeCodex: withAccess(ACCOUNTS_ACCESS)
    .input(RemoveAccountInputSchema)
    .output(type<CodexRateLimitAccountsState>()),
  unsubscribe: withAccess(ACCOUNTS_ACCESS, MOBILE_CLIENT)
    .input(AccountsUnsubscribeInputSchema)
    .output(type<{ unsubscribed: boolean }>()),
  // Why: the rate-limit snapshot already lives on this namespace
  // (AccountsSnapshot.rateLimits, pushed by `subscribe`/read by `list`). Keep
  // its force-a-fetch mutations here too, so one `RateLimitService` instance
  // stays behind one contract group.
  refresh: withAccess(ACCOUNTS_ACCESS)
    .input(RefreshRateLimitsInputSchema)
    .output(type<RateLimitState>()),
  refreshCodexForTarget: withAccess(ACCOUNTS_ACCESS)
    .input(RateLimitRuntimeTargetInputSchema)
    .output(type<RateLimitState>()),
  refreshClaudeForTarget: withAccess(ACCOUNTS_ACCESS)
    .input(RateLimitRuntimeTargetInputSchema)
    .output(type<RateLimitState>()),
  consumeCodexResetCredit: withAccess(ACCOUNTS_ACCESS)
    .input(z.void())
    .output(type<CodexRateLimitResetResult>()),
  fetchInactiveClaudeAccounts: withAccess(ACCOUNTS_ACCESS).input(z.void()).output(type<void>()),
  fetchInactiveCodexAccounts: withAccess(ACCOUNTS_ACCESS).input(z.void()).output(type<void>()),
  refreshGrok: withAccess(ACCOUNTS_ACCESS).input(z.void()).output(type<RateLimitState>()),
  // Why: `RateLimitState.grokAuthConfigured` (same `readGrokAuthSession()`
  // call) already covers `signedIn` on the always-pushed snapshot; these
  // richer fields (email/teamId/tokenFresh/error) serve exactly one Settings
  // row, so they are a separate one-shot read rather than fields added to a
  // snapshot broadcast to every subscriber.
  grokStatus: withAccess(ACCOUNTS_ACCESS).input(z.void()).output(type<GrokAccountStatus>())
} satisfies ContractRouter<RuntimeProcedureMeta>
