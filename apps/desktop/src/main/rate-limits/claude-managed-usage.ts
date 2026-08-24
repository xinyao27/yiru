import type { NetworkProxySettings } from '~shared/network-proxy'
import type { ProviderRateLimits, RateLimitWindow } from '~shared/rate-limit-types'

import {
  deleteActiveClaudeKeychainCredentialsStrict,
  readActiveClaudeKeychainCredentialsStrict,
  writeActiveClaudeKeychainCredentials
} from '../claude/accounts/keychain'
import {
  isOauthTokenExpiring,
  refreshClaudeOauthCredentials
} from '../claude/accounts/oauth-refresh'
import {
  getManagedUsagePanelAuthPreparation,
  readManagedCredentialsJson,
  resolveManagedCredentialsLocation,
  writeManagedCredentialsJson,
  type InactiveClaudeAccountInfo,
  type ManagedCredentialsLocation
} from './claude-managed-credentials'
import { parseOAuthCredentialsJson } from './claude-oauth-credentials'
import { abortedClaudeRateLimitResult, fetchViaOAuth } from './claude-oauth-usage'
import { fetchViaPty } from './claude-pty'
import type { FetchManagedAccountUsageOptions } from './claude-usage-options'
import {
  canSupplementOAuthUsageFromCli,
  mergeClaudeUsageWindows,
  warnClaudeUsageFetchFailure
} from './claude-usage-result'

function windowsAgree(left: RateLimitWindow | null, right: RateLimitWindow | null): boolean {
  return Boolean(left && right && Math.abs(left.usedPercent - right.usedPercent) <= 1)
}

function canTrustManagedUsagePanelSupplement(
  oauthLimits: ProviderRateLimits,
  cliLimits: ProviderRateLimits,
  options: { requireMatchingOAuthWindow: boolean }
): boolean {
  if (!options.requireMatchingOAuthWindow) {
    return true
  }
  const sharedWindowMatches = [
    oauthLimits.session && cliLimits.session
      ? windowsAgree(oauthLimits.session, cliLimits.session)
      : null,
    oauthLimits.weekly && cliLimits.weekly
      ? windowsAgree(oauthLimits.weekly, cliLimits.weekly)
      : null
  ].filter((match): match is boolean => match !== null)
  // Why: macOS inactive previews temporarily stage managed credentials in a
  // scoped Keychain item. If an older Claude build ignores scoped Keychains,
  // matching OAuth windows prevent active-account Fable data from leaking in.
  return sharedWindowMatches.length > 0 && sharedWindowMatches.every(Boolean)
}

async function withManagedPreviewKeychainCredentials<T>(
  location: ManagedCredentialsLocation,
  credentialsJson: string,
  fn: () => Promise<T>
): Promise<T> {
  if (location.kind !== 'keychain') {
    return fn()
  }
  await writeActiveClaudeKeychainCredentials(credentialsJson, location.managedAuthPath)
  try {
    return await fn()
  } finally {
    await deleteActiveClaudeKeychainCredentialsStrict(location.managedAuthPath).catch(() => {})
  }
}

async function readStagedManagedPreviewCredentials(
  location: ManagedCredentialsLocation
): Promise<string | null> {
  if (location.kind !== 'keychain') {
    return null
  }
  try {
    return await readActiveClaudeKeychainCredentialsStrict(location.managedAuthPath)
  } catch {
    return null
  }
}

async function fetchManagedUsagePanelSupplement(input: {
  account: InactiveClaudeAccountInfo
  location: ManagedCredentialsLocation
  credentialsJson: string
  oauthLimits: ProviderRateLimits
  networkProxySettings?: NetworkProxySettings
  signal?: AbortSignal
}): Promise<ProviderRateLimits | null> {
  if (input.signal?.aborted) {
    return null
  }
  const authPreparation = getManagedUsagePanelAuthPreparation(input.account, input.location)
  if (!authPreparation) {
    return null
  }
  return withManagedPreviewKeychainCredentials(input.location, input.credentialsJson, async () => {
    const cliLimits = await fetchViaPty({
      authPreparation,
      networkProxySettings: input.networkProxySettings,
      signal: input.signal
    })
    if (input.signal?.aborted) {
      return null
    }
    if (
      !canTrustManagedUsagePanelSupplement(input.oauthLimits, cliLimits, {
        requireMatchingOAuthWindow: input.location.kind === 'keychain'
      })
    ) {
      return null
    }
    const refreshedCredentials = await readStagedManagedPreviewCredentials(input.location)
    if (refreshedCredentials && refreshedCredentials !== input.credentialsJson) {
      await writeManagedCredentialsJson(input.location, refreshedCredentials)
    }
    return cliLimits
  })
}

export async function fetchManagedAccountUsage(
  account: InactiveClaudeAccountInfo,
  options: FetchManagedAccountUsageOptions = {}
): Promise<ProviderRateLimits> {
  if (options.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  const location = resolveManagedCredentialsLocation(account)
  let credentialsJson = location ? await readManagedCredentialsJson(location) : null
  if (options.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  if (!location || !credentialsJson) {
    return {
      provider: 'claude',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: 'No credentials',
      status: 'error'
    }
  }

  // Why: own the refresh for inactive accounts (claude-swap's model) — when the
  // stored token is expiring, refresh and persist the rotated token back to
  // managed storage before fetching usage. This keeps inactive accounts'
  // single-use refresh tokens fresh so a later switch-in never materializes a
  // stale token. Persistence failure is non-fatal: we still try the fetch.
  let token = parseOAuthCredentialsJson(credentialsJson, 'credentials-file').token
  if (isOauthTokenExpiring(credentialsJson)) {
    const refreshed = await refreshClaudeOauthCredentials(credentialsJson)
    if (options.signal?.aborted) {
      return abortedClaudeRateLimitResult()
    }
    if (refreshed) {
      try {
        await writeManagedCredentialsJson(location, refreshed)
      } catch {
        // Keep going with the refreshed token in memory even if the write
        // failed; worst case the next poll refreshes again.
      }
      credentialsJson = refreshed
      token = parseOAuthCredentialsJson(refreshed, 'credentials-file').token
    }
  }

  if (!token) {
    return {
      provider: 'claude',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: 'No credentials',
      status: 'error'
    }
  }

  // Why: PTY fallback is intentionally omitted for inactive accounts. The PTY
  // path is used only as a supplement after OAuth succeeds, and it points
  // directly at the managed account's isolated config so selection is unchanged.
  const oauthLimits = await fetchViaOAuth(token, options.signal)
  if (options.signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  if (
    !canSupplementOAuthUsageFromCli({
      oauthLimits,
      authPreparation: undefined,
      allowUsagePanelSupplement: options.allowUsagePanelSupplement === true
    })
  ) {
    return oauthLimits
  }
  try {
    const cliLimits = await fetchManagedUsagePanelSupplement({
      account,
      location,
      credentialsJson,
      oauthLimits,
      networkProxySettings: options.networkProxySettings,
      signal: options.signal
    })
    return mergeClaudeUsageWindows(oauthLimits, cliLimits)
  } catch (err) {
    warnClaudeUsageFetchFailure(
      undefined,
      parseOAuthCredentialsJson(credentialsJson, 'credentials-file'),
      err
    )
    return oauthLimits
  }
}
