import type { NetworkProxySettings } from '~shared/network-proxy'
import type { CursorRateLimitRefreshContext, ProviderRateLimits } from '~shared/rate-limit-types'

import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'
import type { ClaudeAccountSelectionTarget } from '../claude/accounts/runtime-selection'
import type { CodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import type { RemoteCursorUsageFetcher } from '../runtime/cursor-usage/client'
import type { CursorUsageRuntimeTarget } from '../runtime/cursor-usage/target'

export type InactiveCodexAccountInfo = {
  id: string
  managedHomePath: string
}

export type CodexHomePathResolver = (target?: CodexAccountSelectionTarget) => string | null
export type ClaudeAuthPreparationResolver = (
  target?: ClaudeAccountSelectionTarget
) => Promise<ClaudeRuntimeAuthPreparation>
export type OpenCodeGoRateLimitConfig = {
  sessionCookie: string
  workspaceIdOverride: string
}
export type MiniMaxRateLimitConfig = {
  sessionCookie: string
  groupId: string
  models: string
}
export type MiniMaxResolvedConfig = {
  config: MiniMaxRateLimitConfig
  error: string | null
}
export type GeminiCliOAuthEnabledResolver = () => boolean
export type CursorRateLimitTargetResolver = (
  context: CursorRateLimitRefreshContext | null
) => CursorUsageRuntimeTarget
export type ActiveRateLimitProvider = ProviderRateLimits['provider']
export type ActiveProviderState = {
  provider: ActiveRateLimitProvider
  limits: ProviderRateLimits | null
}
export type ActiveWindowRefreshPlan =
  | { kind: 'none' }
  | { kind: 'full' }
  | { kind: 'providers'; providers: ActiveRateLimitProvider[] }
export type InternalRateLimitState = {
  claude: ProviderRateLimits | null
  codex: ProviderRateLimits | null
  cursor: ProviderRateLimits | null
  gemini: ProviderRateLimits | null
  opencodeGo: ProviderRateLimits | null
  kimi: ProviderRateLimits | null
  antigravity: ProviderRateLimits | null
  minimax: ProviderRateLimits | null
  grok: ProviderRateLimits | null
}

export const DEFAULT_POLL_MS = 15 * 60 * 1_000
export const MIN_POLL_MS = 30 * 1_000
export const MAX_POLL_MS = 2_147_483_647
export const MIN_REFETCH_MS = 5 * 60 * 1_000
export const ACTIVE_FAILURE_REFETCH_MS = MIN_POLL_MS
export const MAX_ACTIVE_FAILURE_REFETCH_MS = DEFAULT_POLL_MS
export const MAX_ACTIVE_FAILURE_STREAK = 8
export const INDIVIDUALLY_REFRESHABLE_PROVIDERS: ReadonlySet<ActiveRateLimitProvider> = new Set([
  'claude',
  'codex',
  'grok'
])
export const STALE_THRESHOLD_MS = 30 * 60 * 1_000
export const INACTIVE_FETCH_DEBOUNCE_MS = 60 * 1_000
export const DEFERRED_STARTUP_ACTIVE_REFRESH_MS = 1_000

export type ServiceResolvers = {
  remoteCursorUsageFetcher: RemoteCursorUsageFetcher | undefined
  networkProxySettingsResolver: (() => NetworkProxySettings) | null
}

export function normalizePollingInterval(ms: number): number {
  if (!Number.isFinite(ms)) {
    return DEFAULT_POLL_MS
  }
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, ms))
}

export function getCursorTargetKey(target: CursorUsageRuntimeTarget): string {
  if (target.runtime === 'host') {
    return 'host'
  }
  if (target.runtime === 'wsl') {
    return `wsl:${target.wslDistro ?? ''}`
  }
  return `environment:${target.environmentId}`
}

export function isSystemDefaultClaudeAuth(
  authPreparation: ClaudeRuntimeAuthPreparation | undefined
): boolean {
  if (!authPreparation) {
    return true
  }
  const provenance = authPreparation.provenance
  return provenance === 'system' || Boolean(provenance?.endsWith(':system'))
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createProviderFetchError(
  provider: ActiveRateLimitProvider,
  reason: unknown,
  includeMonthly = false
): ProviderRateLimits {
  return {
    provider,
    session: null,
    weekly: null,
    ...(includeMonthly ? { monthly: null } : {}),
    updatedAt: Date.now(),
    error: reason instanceof Error ? reason.message : 'Unknown error',
    status: 'error'
  }
}
