import type { NetworkProxySettings } from '@yiru/runtime-protocol/workbench/network-proxy'
import type {
  ProviderRateLimits,
  UsageRateLimitFailureKind,
  UsageRateLimitMetadata,
  UsageRateLimitSource
} from '@yiru/runtime-protocol/workbench/rate-limit-types'

import type { ClaudeRuntimeAuthPreparation } from '../agents/claude/accounts/runtime-auth-service'
import type { OAuthCredentialReadResult } from './claude-oauth-credentials'
import { OAuthUsageError } from './claude-oauth-usage-error'
import { fetchViaPty } from './claude-pty'

export type ClaudeUsageAttemptState = {
  attemptedSources: UsageRateLimitSource[]
}

function buildClaudeUsageFetchDiagnostic(
  authPreparation: ClaudeRuntimeAuthPreparation | undefined,
  oauthCredentials: OAuthCredentialReadResult
): Record<string, unknown> {
  return {
    provenance: authPreparation?.provenance ?? 'system',
    runtime: authPreparation?.runtime ?? 'host',
    wslDistro: authPreparation?.wslDistro ?? null,
    hasExplicitClaudeConfigDir: Boolean(authPreparation?.envPatch.CLAUDE_CONFIG_DIR),
    credentialSource: oauthCredentials.source,
    keychainUnavailable: oauthCredentials.keychainUnavailable,
    hasRefreshableCredentials: oauthCredentials.hasRefreshableCredentials
  }
}

export function warnClaudeUsageFetchFailure(
  authPreparation: ClaudeRuntimeAuthPreparation | undefined,
  oauthCredentials: OAuthCredentialReadResult,
  error: unknown
): void {
  const message = error instanceof Error ? error.message : String(error)
  const status = error instanceof OAuthUsageError ? error.status : null
  console.warn('[claude-rate-limits] Claude usage refresh failed', {
    ...buildClaudeUsageFetchDiagnostic(authPreparation, oauthCredentials),
    status,
    message
  })
}

export function recordAttempt(
  state: ClaudeUsageAttemptState,
  source: UsageRateLimitSource
): UsageRateLimitSource[] {
  if (!state.attemptedSources.includes(source)) {
    state.attemptedSources.push(source)
  }
  return state.attemptedSources
}

export function withClaudeUsageMetadata(
  limits: ProviderRateLimits,
  metadata: UsageRateLimitMetadata
): ProviderRateLimits {
  return {
    ...limits,
    usageMetadata: {
      ...limits.usageMetadata,
      ...metadata,
      attemptedSources: metadata.attemptedSources ?? limits.usageMetadata?.attemptedSources
    }
  }
}

export function makeClaudeUsageResult(
  status: ProviderRateLimits['status'],
  error: string | null,
  metadata: UsageRateLimitMetadata
): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error,
    status,
    usageMetadata: metadata
  }
}

export function metadataForAttempt(input: {
  attemptedSources: UsageRateLimitSource[]
  oauthCredentials: OAuthCredentialReadResult
  authPreparation?: ClaudeRuntimeAuthPreparation
  source?: UsageRateLimitSource
  failureKind?: UsageRateLimitFailureKind
  deferredByLiveClaudeSession?: boolean
}): UsageRateLimitMetadata {
  return {
    source: input.source,
    attemptedSources: [...input.attemptedSources],
    failureKind: input.failureKind,
    credentialSource: input.oauthCredentials.source,
    authProvenance: input.authPreparation?.provenance ?? 'system',
    deferredByLiveClaudeSession: input.deferredByLiveClaudeSession
  }
}

function classifyClaudeCliUsageFailure(
  limits: ProviderRateLimits
): UsageRateLimitFailureKind | undefined {
  if (!limits.error) {
    return undefined
  }
  if (/rate limited/i.test(limits.error)) {
    return 'rate-limited'
  }
  if (/plan usage is unavailable|usage is unavailable/i.test(limits.error)) {
    return 'usage-unavailable'
  }
  return 'cli-unavailable'
}

export async function fetchClaudeUsageViaCli(input: {
  authPreparation?: ClaudeRuntimeAuthPreparation
  oauthCredentials: OAuthCredentialReadResult
  attempts: ClaudeUsageAttemptState
  networkProxySettings?: NetworkProxySettings
  signal?: AbortSignal
}): Promise<ProviderRateLimits> {
  recordAttempt(input.attempts, 'cli')
  const limits = await fetchViaPty({
    authPreparation: input.authPreparation,
    networkProxySettings: input.networkProxySettings,
    signal: input.signal
  })
  return withClaudeUsageMetadata(
    limits,
    metadataForAttempt({
      attemptedSources: input.attempts.attemptedSources,
      oauthCredentials: input.oauthCredentials,
      authPreparation: input.authPreparation,
      source: 'cli',
      failureKind: classifyClaudeCliUsageFailure(limits)
    })
  )
}

export function isManagedClaudeAuth(
  authPreparation: ClaudeRuntimeAuthPreparation | undefined
): boolean {
  return authPreparation?.provenance.startsWith('managed:') === true
}

export function canSupplementOAuthUsageFromCli(input: {
  oauthLimits: ProviderRateLimits
  authPreparation?: ClaudeRuntimeAuthPreparation
  allowUsagePanelSupplement: boolean
}): boolean {
  // Why: Fable is visible in Claude's interactive /usage panel even when the
  // OAuth usage endpoint only reports documented 5h/7d windows. This runs only
  // after OAuth succeeds, so it must not become a broad auth-recovery fallback.
  return Boolean(
    input.allowUsagePanelSupplement &&
    !input.authPreparation?.managedRefreshDeferredByLivePty &&
    !input.oauthLimits.fableWeekly &&
    (input.oauthLimits.session || input.oauthLimits.weekly)
  )
}

export function mergeClaudeUsageWindows(
  primary: ProviderRateLimits,
  supplement: ProviderRateLimits | null
): ProviderRateLimits {
  if (!supplement) {
    return primary
  }
  return {
    ...primary,
    session: primary.session ?? supplement.session,
    weekly: primary.weekly ?? supplement.weekly,
    fableWeekly: primary.fableWeekly ?? supplement.fableWeekly ?? null
  }
}
