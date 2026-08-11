// Why: keep these shapes in lockstep with packages/shared/src/types.ts and
// packages/shared/src/rate-limit-types.ts. We don't import from desktop here because
// the mobile bundle must not pull in Electron-coupled type files.
//
// Pure state/selectors live here (no React Native imports) so they can be
// unit-tested directly; account-usage.tsx re-exports them alongside the
// UsageBar component.
import { formatResetCountdown } from '@yiru/workbench-model/ui'

export type RateLimitWindow = {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
  resetDescription: string | null
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
  planType?: string | null
  updatedAt: number
  error: string | null
  status: 'idle' | 'fetching' | 'ok' | 'error' | 'unavailable'
}

export type InactiveAccountUsage = {
  accountId: string
  rateLimits: ProviderRateLimits | null
  updatedAt: number
  isFetching: boolean
}

export type ClaudeAccountSummary = {
  id: string
  email: string
  organizationName?: string | null
}

export type CodexAccountSummary = {
  id: string
  email: string
  workspaceLabel?: string | null
}

export type AccountsSnapshot = {
  claude: { accounts: ClaudeAccountSummary[]; activeAccountId: string | null }
  codex: { accounts: CodexAccountSummary[]; activeAccountId: string | null }
  rateLimits: {
    claude: ProviderRateLimits | null
    codex: ProviderRateLimits | null
    cursor?: ProviderRateLimits | null
    gemini?: ProviderRateLimits | null
    opencodeGo?: ProviderRateLimits | null
    kimi?: ProviderRateLimits | null
    antigravity?: ProviderRateLimits | null
    minimax?: ProviderRateLimits | null
    grok?: ProviderRateLimits | null
    minimaxCookieConfigured?: boolean
    grokAuthConfigured?: boolean
    inactiveClaudeAccounts: InactiveAccountUsage[]
    inactiveCodexAccounts: InactiveAccountUsage[]
  }
}

export type ProviderKey = 'claude' | 'codex'

export type UsageProviderKey =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'opencode-go'
  | 'kimi'
  | 'antigravity'
  | 'minimax'
  | 'grok'

export const USAGE_PROVIDER_KEYS = [
  'claude',
  'codex',
  'cursor',
  'gemini',
  'opencode-go',
  'kimi',
  'antigravity',
  'minimax',
  'grok'
] as const satisfies readonly UsageProviderKey[]

export type UsageBarState = {
  usedPercent: number | null
  unavailable: boolean
  loading: boolean
}

export function getActiveProviderRateLimits(
  snapshot: AccountsSnapshot,
  provider: ProviderKey
): ProviderRateLimits | null {
  return getProviderRateLimits(snapshot, provider)
}

export function getProviderRateLimits(
  snapshot: AccountsSnapshot,
  provider: UsageProviderKey
): ProviderRateLimits | null {
  switch (provider) {
    case 'claude':
      return snapshot.rateLimits.claude
    case 'codex':
      return snapshot.rateLimits.codex
    case 'cursor':
      return snapshot.rateLimits.cursor ?? null
    case 'gemini':
      return snapshot.rateLimits.gemini ?? null
    case 'opencode-go':
      return snapshot.rateLimits.opencodeGo ?? null
    case 'kimi':
      return snapshot.rateLimits.kimi ?? null
    case 'antigravity':
      return snapshot.rateLimits.antigravity ?? null
    case 'minimax':
      return snapshot.rateLimits.minimax ?? null
    case 'grok':
      return snapshot.rateLimits.grok ?? null
  }
}

export function getInactiveProviderUsage(
  snapshot: AccountsSnapshot,
  provider: ProviderKey,
  accountId: string
): InactiveAccountUsage | null {
  const list =
    provider === 'claude'
      ? snapshot.rateLimits.inactiveClaudeAccounts
      : snapshot.rateLimits.inactiveCodexAccounts
  return list.find((u) => u.accountId === accountId) ?? null
}

// Why: rate limits are fetched for the active target even when no Yiru-managed
// account exists (the default target is the agent's own system-default login).
// Treat a provider as having usage worth showing when a fetch succeeded or any
// window has data; an unavailable/error provider with no windows means the
// system-default login has no credentials for it, so there is nothing to show.
export function hasActiveProviderUsage(limits: ProviderRateLimits | null): boolean {
  if (!limits) {
    return false
  }
  if (
    limits.session != null ||
    limits.weekly != null ||
    limits.fableWeekly != null ||
    limits.monthly != null ||
    (limits.buckets && limits.buckets.length > 0)
  ) {
    return true
  }
  return limits.status === 'ok'
}

// Why: transient errors keep the last successful window data, so availability
// is per window rather than per provider status.
export function getUsageBarState(
  limits: ProviderRateLimits | null,
  windowKey: 'session' | 'weekly' | 'fableWeekly',
  isFetchingOverride?: boolean
): UsageBarState {
  const window = limits?.[windowKey] ?? null
  const fetching =
    isFetchingOverride ?? (limits?.status === 'fetching' || limits?.status === 'idle')
  return {
    usedPercent: window?.usedPercent ?? null,
    unavailable: window == null && !fetching,
    loading: fetching && window == null
  }
}

/**
 * Reset countdown for one window, e.g. "Resets in 3h 54m" / "Resets now",
 * or null when the window has no reset timestamp (so the UI degrades to
 * today's bars-only layout).
 *
 * Why: shares formatResetCountdown with the desktop status-bar tooltip so the
 * copy stays identical across surfaces. `now` is a parameter so the function
 * stays pure and unit-testable.
 */
export function getWindowResetLabel(
  limits: ProviderRateLimits | null,
  windowKey: 'session' | 'weekly',
  now: number
): string | null {
  return getUsageWindowResetLabel(limits?.[windowKey] ?? null, now)
}

export function getUsageWindowResetLabel(
  window: RateLimitWindow | null,
  now: number
): string | null {
  const resetsAt = window?.resetsAt
  if (resetsAt == null) {
    return null
  }
  return formatResetCountdown(resetsAt - now)
}

export function getProviderResetLabel(
  limits: ProviderRateLimits | null,
  now: number
): string | null {
  const resets = [
    limits?.session?.resetsAt,
    limits?.weekly?.resetsAt,
    limits?.fableWeekly?.resetsAt,
    limits?.monthly?.resetsAt,
    ...(limits?.buckets ?? []).map((bucket) => bucket.resetsAt)
  ].filter((reset): reset is number => typeof reset === 'number' && Number.isFinite(reset))
  if (resets.length === 0) {
    return null
  }
  return formatResetCountdown(Math.min(...resets) - now)
}

// Why: the usage UI must render for the system-default login, not only for
// Yiru-managed accounts. Show a provider when it has at least one managed
// account OR active rate-limit data for the system-default target.
export function hasRenderableUsage(
  snapshot: AccountsSnapshot,
  provider: UsageProviderKey
): boolean {
  const accounts =
    provider === 'claude'
      ? snapshot.claude.accounts
      : provider === 'codex'
        ? snapshot.codex.accounts
        : []
  if (accounts.length > 0) {
    return true
  }
  const limits = getProviderRateLimits(snapshot, provider)
  return (
    hasActiveProviderUsage(limits) ||
    (limits !== null && limits.status !== 'unavailable' && limits.status !== 'idle')
  )
}
