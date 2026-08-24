import type { NetworkProxySettings } from '~shared/network-proxy'
import type { ProviderRateLimits } from '~shared/rate-limit-types'

import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'
import { withMacTailscaleDnsHint } from '../network/macos-tailscale-dns-diagnostic'
import {
  readCredentialsFromStrictKeychain,
  readOAuthCredentials,
  resolveOAuthCredentialReadOptions,
  type OAuthCredentialReadResult
} from './claude-oauth-credentials'
import { abortedClaudeRateLimitResult, fetchViaOAuth } from './claude-oauth-usage'
import type { ClaudeUsageErrorClassification } from './claude-usage-error-classification'
import type { FetchClaudeRateLimitsOptions } from './claude-usage-options'
import {
  canSupplementOAuthUsageFromCli,
  fetchClaudeUsageViaCli,
  isManagedClaudeAuth,
  makeClaudeUsageResult,
  mergeClaudeUsageWindows,
  metadataForAttempt,
  recordAttempt,
  warnClaudeUsageFetchFailure,
  withClaudeUsageMetadata,
  type ClaudeUsageAttemptState
} from './claude-usage-result'

const LIVE_CLAUDE_REFRESH_DEFERRED_MESSAGE =
  'Claude usage refresh is waiting for the live Claude terminal to rotate its credentials.'

export async function supplementOAuthUsageFromCli(input: {
  oauthLimits: ProviderRateLimits
  authPreparation?: ClaudeRuntimeAuthPreparation
  oauthCredentials: OAuthCredentialReadResult
  attempts: ClaudeUsageAttemptState
  allowUsagePanelSupplement: boolean
  networkProxySettings?: NetworkProxySettings
  signal?: AbortSignal
}): Promise<ProviderRateLimits> {
  if (input.signal?.aborted || !canSupplementOAuthUsageFromCli(input)) {
    return input.oauthLimits
  }
  try {
    const cliLimits = await fetchClaudeUsageViaCli({
      authPreparation: input.authPreparation,
      oauthCredentials: input.oauthCredentials,
      attempts: input.attempts,
      networkProxySettings: input.networkProxySettings,
      signal: input.signal
    })
    return mergeClaudeUsageWindows(input.oauthLimits, cliLimits)
  } catch (err) {
    warnClaudeUsageFetchFailure(input.authPreparation, input.oauthCredentials, err)
    return input.oauthLimits
  }
}

export async function completeOAuthUsageSuccess(input: {
  oauthLimits: ProviderRateLimits
  oauthCredentials: OAuthCredentialReadResult
  attempts: ClaudeUsageAttemptState
  options?: FetchClaudeRateLimitsOptions
}): Promise<ProviderRateLimits> {
  const limits = await supplementOAuthUsageFromCli({
    oauthLimits: input.oauthLimits,
    authPreparation: input.options?.authPreparation,
    oauthCredentials: input.oauthCredentials,
    attempts: input.attempts,
    networkProxySettings: input.options?.networkProxySettings,
    allowUsagePanelSupplement:
      input.options?.allowUsagePanelSupplement ??
      isManagedClaudeAuth(input.options?.authPreparation),
    signal: input.options?.signal
  })
  if (input.options?.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  return withClaudeUsageMetadata(
    limits,
    metadataForAttempt({
      attemptedSources: input.attempts.attemptedSources,
      oauthCredentials: input.oauthCredentials,
      authPreparation: input.options?.authPreparation,
      source: 'oauth'
    })
  )
}

export function canRetryWithLegacyKeychainToken(input: {
  classification: ClaudeUsageErrorClassification
  oauthCredentials: OAuthCredentialReadResult
  authPreparation?: ClaudeRuntimeAuthPreparation
}): boolean {
  // Why: the CLI only maintains the legacy keychain item for the default config
  // dir, so a scoped item can hold a token that expired long ago and will 401
  // on every fetch with no recovery path. Host system-default auth may retry
  // with the legacy item; managed/WSL credentials must never be answered with
  // the host user's legacy keychain account.
  return (
    input.classification.failureKind === 'stale-token' &&
    input.oauthCredentials.source === 'scoped-keychain' &&
    (input.authPreparation?.runtime ?? 'host') === 'host' &&
    !isManagedClaudeAuth(input.authPreparation)
  )
}

export async function retryOAuthWithLegacyKeychainToken(input: {
  failedToken: string | null
  attempts: ClaudeUsageAttemptState
  options?: FetchClaudeRateLimitsOptions
}): Promise<ProviderRateLimits | null> {
  const legacyCredentials = await readCredentialsFromStrictKeychain(undefined, 'legacy-keychain')
  if (!legacyCredentials.token || legacyCredentials.token === input.failedToken) {
    return null
  }
  if (input.options?.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  try {
    const oauthLimits = await fetchViaOAuth(legacyCredentials.token, input.options?.signal)
    if (input.options?.signal?.aborted) {
      return abortedClaudeRateLimitResult()
    }
    return await completeOAuthUsageSuccess({
      oauthLimits,
      oauthCredentials: legacyCredentials,
      attempts: input.attempts,
      options: input.options
    })
  } catch (err) {
    warnClaudeUsageFetchFailure(input.options?.authPreparation, legacyCredentials, err)
    return null
  }
}

export function shouldDeferForLiveClaude(
  authPreparation: ClaudeRuntimeAuthPreparation | undefined,
  classification: ClaudeUsageErrorClassification
): boolean {
  return Boolean(
    authPreparation?.managedRefreshDeferredByLivePty &&
    (classification.failureKind === 'stale-token' ||
      classification.failureKind === 'refreshable-credentials-without-token' ||
      classification.failureKind === 'deferred-by-live-session')
  )
}

export function liveClaudeDeferredResult(input: {
  attempts: ClaudeUsageAttemptState
  oauthCredentials: OAuthCredentialReadResult
  authPreparation?: ClaudeRuntimeAuthPreparation
}): ProviderRateLimits {
  return makeClaudeUsageResult('error', LIVE_CLAUDE_REFRESH_DEFERRED_MESSAGE, {
    ...metadataForAttempt({
      attemptedSources: input.attempts.attemptedSources,
      oauthCredentials: input.oauthCredentials,
      authPreparation: input.authPreparation,
      failureKind: 'deferred-by-live-session',
      deferredByLiveClaudeSession: true
    })
  })
}

export function errorResultForClassification(input: {
  error: unknown
  classification: ClaudeUsageErrorClassification
  attempts: ClaudeUsageAttemptState
  oauthCredentials: OAuthCredentialReadResult
  authPreparation?: ClaudeRuntimeAuthPreparation
}): ProviderRateLimits {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error || 'Unknown error')
  return makeClaudeUsageResult('error', withMacTailscaleDnsHint(message), {
    ...metadataForAttempt({
      attemptedSources: input.attempts.attemptedSources,
      oauthCredentials: input.oauthCredentials,
      authPreparation: input.authPreparation,
      failureKind: input.classification.failureKind
    })
  })
}

export async function attemptCliRepairThenRetryOAuth(input: {
  options?: FetchClaudeRateLimitsOptions
  attempts: ClaudeUsageAttemptState
  oauthCredentials: OAuthCredentialReadResult
}): Promise<ProviderRateLimits | null> {
  if (input.options?.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  let cliResult: ProviderRateLimits | null = null
  try {
    cliResult = await fetchClaudeUsageViaCli({
      authPreparation: input.options?.authPreparation,
      oauthCredentials: input.oauthCredentials,
      attempts: input.attempts,
      networkProxySettings: input.options?.networkProxySettings,
      signal: input.options?.signal
    })
  } catch (err) {
    warnClaudeUsageFetchFailure(input.options?.authPreparation, input.oauthCredentials, err)
  }

  // Why: bail before credential I/O if the fetch cycle was stopped mid-CLI-repair.
  if (input.options?.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }

  const refreshedCredentials = await readOAuthCredentials(
    resolveOAuthCredentialReadOptions(input.options?.authPreparation)
  )
  if (input.options?.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  if (refreshedCredentials.token) {
    recordAttempt(input.attempts, 'oauth')
    try {
      const oauthRetry = await fetchViaOAuth(refreshedCredentials.token, input.options?.signal)
      if (input.options?.signal?.aborted) {
        return abortedClaudeRateLimitResult()
      }
      const supplemented = mergeClaudeUsageWindows(oauthRetry, cliResult)
      return withClaudeUsageMetadata(
        supplemented,
        metadataForAttempt({
          attemptedSources: input.attempts.attemptedSources,
          oauthCredentials: refreshedCredentials,
          authPreparation: input.options?.authPreparation,
          source: 'oauth'
        })
      )
    } catch (err) {
      warnClaudeUsageFetchFailure(input.options?.authPreparation, refreshedCredentials, err)
    }
  }

  return cliResult
}
