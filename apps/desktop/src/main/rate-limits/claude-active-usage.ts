import type { ProviderRateLimits } from '~shared/rate-limit-types'

import { withMacTailscaleDnsHint } from '../network/macos-tailscale-dns-diagnostic'
import { readOAuthCredentials, resolveOAuthCredentialReadOptions } from './claude-oauth-credentials'
import { abortedClaudeRateLimitResult, fetchViaOAuth } from './claude-oauth-usage'
import {
  classifyClaudeCredentialAbsence,
  classifyClaudeOAuthUsageError
} from './claude-usage-error-classification'
import {
  attemptCliRepairThenRetryOAuth,
  canRetryWithLegacyKeychainToken,
  completeOAuthUsageSuccess,
  errorResultForClassification,
  liveClaudeDeferredResult,
  retryOAuthWithLegacyKeychainToken,
  shouldDeferForLiveClaude
} from './claude-usage-fallback'
import type { FetchClaudeRateLimitsOptions } from './claude-usage-options'
import { resolveClaudeUsageRefreshPlan } from './claude-usage-refresh-plan'
import {
  fetchClaudeUsageViaCli,
  makeClaudeUsageResult,
  metadataForAttempt,
  recordAttempt,
  warnClaudeUsageFetchFailure,
  type ClaudeUsageAttemptState
} from './claude-usage-result'

export async function fetchClaudeRateLimits(
  options?: FetchClaudeRateLimitsOptions
): Promise<ProviderRateLimits> {
  if (options?.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  const attempts: ClaudeUsageAttemptState = { attemptedSources: [] }
  const allowCliFallback = options?.allowPtyFallback !== false
  const plan = resolveClaudeUsageRefreshPlan({
    authPreparation: options?.authPreparation,
    allowCliFallback
  })

  if (options?.authPreparation?.runtime === 'wsl' && !options.authPreparation.wslLinuxConfigDir) {
    return makeClaudeUsageResult(
      'error',
      `WSL Claude config unavailable for ${options.authPreparation.wslDistro ?? 'default distro'}`,
      {
        attemptedSources: [],
        failureKind: 'cli-unavailable',
        authProvenance: options.authPreparation.provenance
      }
    )
  }

  const oauthCredentials = await readOAuthCredentials(
    resolveOAuthCredentialReadOptions(options?.authPreparation)
  )
  if (options?.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }

  if (plan.steps.some((step) => step.source === 'oauth') && oauthCredentials.token) {
    recordAttempt(attempts, 'oauth')
    try {
      const oauthLimits = await fetchViaOAuth(oauthCredentials.token, options?.signal)
      if (options?.signal?.aborted) {
        return abortedClaudeRateLimitResult()
      }
      return await completeOAuthUsageSuccess({ oauthLimits, oauthCredentials, attempts, options })
    } catch (err) {
      warnClaudeUsageFetchFailure(options?.authPreparation, oauthCredentials, err)
      const classification = classifyClaudeOAuthUsageError(err)

      if (
        canRetryWithLegacyKeychainToken({
          classification,
          oauthCredentials,
          authPreparation: options?.authPreparation
        })
      ) {
        const legacyResult = await retryOAuthWithLegacyKeychainToken({
          failedToken: oauthCredentials.token,
          attempts,
          options
        })
        if (legacyResult) {
          return legacyResult
        }
      }

      if (shouldDeferForLiveClaude(options?.authPreparation, classification)) {
        return liveClaudeDeferredResult({
          attempts,
          oauthCredentials,
          authPreparation: options?.authPreparation
        })
      }

      if (classification.shouldAttemptDelegatedRefresh && allowCliFallback) {
        const repaired = await attemptCliRepairThenRetryOAuth({
          options,
          attempts,
          oauthCredentials
        })
        if (repaired) {
          return repaired
        }
      }

      if (classification.shouldAttemptCliFallback && allowCliFallback) {
        try {
          return await fetchClaudeUsageViaCli({
            authPreparation: options?.authPreparation,
            oauthCredentials,
            attempts,
            networkProxySettings: options?.networkProxySettings,
            signal: options?.signal
          })
        } catch (ptyError) {
          warnClaudeUsageFetchFailure(options?.authPreparation, oauthCredentials, ptyError)
        }
      }

      return errorResultForClassification({
        error: err,
        classification,
        attempts,
        oauthCredentials,
        authPreparation: options?.authPreparation
      })
    }
  }

  const credentialClassification = classifyClaudeCredentialAbsence({
    hasRefreshableCredentials: oauthCredentials.hasRefreshableCredentials,
    keychainUnavailable: oauthCredentials.keychainUnavailable,
    managedRefreshDeferredByLivePty: options?.authPreparation?.managedRefreshDeferredByLivePty
  })

  if (shouldDeferForLiveClaude(options?.authPreparation, credentialClassification)) {
    return liveClaudeDeferredResult({
      attempts,
      oauthCredentials,
      authPreparation: options?.authPreparation
    })
  }

  if (
    oauthCredentials.hasRefreshableCredentials &&
    credentialClassification.shouldAttemptDelegatedRefresh &&
    allowCliFallback
  ) {
    const repaired = await attemptCliRepairThenRetryOAuth({
      options,
      attempts,
      oauthCredentials
    })
    if (repaired) {
      return repaired
    }
  }

  if (
    (oauthCredentials.token ||
      oauthCredentials.hasRefreshableCredentials ||
      oauthCredentials.keychainUnavailable) &&
    credentialClassification.shouldAttemptCliFallback &&
    allowCliFallback
  ) {
    try {
      return await fetchClaudeUsageViaCli({
        authPreparation: options?.authPreparation,
        oauthCredentials,
        attempts,
        networkProxySettings: options?.networkProxySettings,
        signal: options?.signal
      })
    } catch (err) {
      warnClaudeUsageFetchFailure(options?.authPreparation, oauthCredentials, err)
      return makeClaudeUsageResult('error', withMacTailscaleDnsHint(describeError(err)), {
        ...metadataForAttempt({
          attemptedSources: attempts.attemptedSources,
          oauthCredentials,
          authPreparation: options?.authPreparation,
          failureKind:
            credentialClassification.failureKind === 'keychain-unavailable'
              ? 'keychain-unavailable'
              : 'cli-unavailable'
        })
      })
    }
  }

  if (oauthCredentials.keychainUnavailable) {
    return makeClaudeUsageResult('error', 'Claude Keychain credentials unavailable', {
      ...metadataForAttempt({
        attemptedSources: attempts.attemptedSources,
        oauthCredentials,
        authPreparation: options?.authPreparation,
        failureKind: 'keychain-unavailable'
      })
    })
  }

  if (oauthCredentials.hasRefreshableCredentials) {
    return makeClaudeUsageResult('error', 'Claude OAuth access token unavailable', {
      ...metadataForAttempt({
        attemptedSources: attempts.attemptedSources,
        oauthCredentials,
        authPreparation: options?.authPreparation,
        failureKind: credentialClassification.failureKind
      })
    })
  }

  if (allowCliFallback && plan.steps.some((step) => step.source === 'cli')) {
    try {
      return await fetchClaudeUsageViaCli({
        authPreparation: options?.authPreparation,
        oauthCredentials,
        attempts,
        networkProxySettings: options?.networkProxySettings,
        signal: options?.signal
      })
    } catch (err) {
      warnClaudeUsageFetchFailure(options?.authPreparation, oauthCredentials, err)
    }
  }

  return makeClaudeUsageResult('unavailable', 'No subscription plan — API key billing', {
    ...metadataForAttempt({
      attemptedSources: attempts.attemptedSources,
      oauthCredentials,
      authPreparation: options?.authPreparation,
      failureKind: 'missing-credentials'
    })
  })
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
