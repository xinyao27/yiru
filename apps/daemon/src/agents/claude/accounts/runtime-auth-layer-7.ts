import type { ClaudeManagedAccount } from '@yiru/runtime-protocol/workbench/types'

import type { ClaudeAuthIdentity, ClaudeReadBackMatch } from './runtime-auth-foundation'
import { ClaudeRuntimeAuthLayer6 } from './runtime-auth-layer-6'

export abstract class ClaudeRuntimeAuthLayer7 extends ClaudeRuntimeAuthLayer6 {
  protected runtimeCredentialsMatchAccount(
    runtimeCredentialsJson: string,
    runtimeOauthAccount: unknown,
    account: ClaudeManagedAccount,
    managedCredentialsJson: string,
    managedOauthAccount: unknown
  ): 'match' | 'mismatch' | 'unverifiable' {
    const identity = this.readIdentityFromCredentials(runtimeCredentialsJson)
    if (!identity) {
      return 'mismatch'
    }
    const managedIdentity = this.readIdentityFromCredentials(managedCredentialsJson)
    const managedOauthIdentity = this.readIdentityFromOauthAccount(managedOauthAccount)
    const runtimeOauthIdentity = this.readIdentityFromOauthAccount(runtimeOauthAccount)
    const credentialOauthConflict =
      (identity.accountUuid &&
        runtimeOauthIdentity.accountUuid &&
        identity.accountUuid !== runtimeOauthIdentity.accountUuid) ||
      (identity.email &&
        runtimeOauthIdentity.email &&
        identity.email !== runtimeOauthIdentity.email) ||
      (identity.organizationUuid &&
        runtimeOauthIdentity.organizationUuid &&
        identity.organizationUuid !== runtimeOauthIdentity.organizationUuid)
    if (credentialOauthConflict) {
      return 'mismatch'
    }

    // Why: this mirrors the Codex runtime-home guard. If another Claude login
    // or missed live process rewrites shared runtime credentials, do not
    // persist those credentials into the selected managed account.
    const selectedOrganizationUuid = this.normalizeField(
      account.organizationUuid ??
        managedIdentity?.organizationUuid ??
        managedOauthIdentity.organizationUuid
    )
    const oauthAccountMatches =
      Boolean(managedOauthIdentity.accountUuid) &&
      managedOauthIdentity.accountUuid === runtimeOauthIdentity.accountUuid &&
      Boolean(runtimeOauthIdentity.email || runtimeOauthIdentity.organizationUuid)
    const runtimeEmail = identity.email ?? runtimeOauthIdentity.email
    const runtimeOrganizationUuid =
      identity.organizationUuid ?? runtimeOauthIdentity.organizationUuid
    const refreshTokenComparison = this.compareRefreshTokens(
      runtimeCredentialsJson,
      managedCredentialsJson
    )
    if (!runtimeEmail) {
      if (refreshTokenComparison === 'same') {
        return 'match'
      }
      if (identity.organizationUuid) {
        if (selectedOrganizationUuid && selectedOrganizationUuid !== identity.organizationUuid) {
          return 'mismatch'
        }
        return 'unverifiable'
      }
      if (oauthAccountMatches) {
        return 'match'
      }
      if (!runtimeOrganizationUuid && refreshTokenComparison === 'different') {
        return 'mismatch'
      }
      return 'unverifiable'
    }
    if (account.email && this.normalizeField(account.email) !== runtimeEmail) {
      return 'mismatch'
    }
    if (selectedOrganizationUuid && !runtimeOrganizationUuid) {
      return refreshTokenComparison === 'same' || oauthAccountMatches ? 'match' : 'unverifiable'
    }
    if (
      selectedOrganizationUuid &&
      runtimeOrganizationUuid &&
      selectedOrganizationUuid !== runtimeOrganizationUuid
    ) {
      return 'mismatch'
    }
    if (!selectedOrganizationUuid && runtimeOrganizationUuid) {
      return refreshTokenComparison === 'same' ? 'match' : 'unverifiable'
    }

    return 'match'
  }

  protected liveRuntimeCredentialsCanUpdateActiveAccount(
    runtimeCredentialsJson: string,
    account: ClaudeManagedAccount,
    managedCredentialsJson: string,
    managedOauthAccount: unknown
  ): boolean {
    const match = this.runtimeCredentialsMatchAccount(
      runtimeCredentialsJson,
      this.readRuntimeOauthAccount(),
      account,
      managedCredentialsJson,
      managedOauthAccount
    )
    if (match === 'match') {
      return true
    }
    const identity = this.readIdentityFromCredentials(runtimeCredentialsJson)
    const managedIdentity = this.readIdentityFromCredentials(managedCredentialsJson)
    const managedOauthIdentity = this.readIdentityFromOauthAccount(managedOauthAccount)
    const runtimeOauthIdentity = this.readIdentityFromOauthAccount(this.readRuntimeOauthAccount())
    const selectedOrganizationUuid = this.normalizeField(
      account.organizationUuid ??
        managedIdentity?.organizationUuid ??
        managedOauthIdentity.organizationUuid
    )
    return (
      match === 'unverifiable' &&
      Boolean(selectedOrganizationUuid) &&
      (identity?.organizationUuid ?? runtimeOauthIdentity.organizationUuid) ===
        selectedOrganizationUuid
    )
  }

  protected readIdentityFromCredentials(credentialsJson: string): ClaudeAuthIdentity | null {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(credentialsJson) as Record<string, unknown>
    } catch {
      return null
    }
    const oauth = this.asRecord(parsed.claudeAiOauth)
    return {
      accountUuid: this.normalizeField(
        this.readString(oauth, 'accountUuid') ?? this.readString(oauth, 'accountId')
      ),
      email: this.normalizeField(this.readString(oauth, 'email')),
      organizationUuid: this.normalizeField(
        this.readString(oauth, 'organizationUuid') ?? this.readString(oauth, 'organizationId')
      )
    }
  }

  protected isValidCredentialsJsonObject(credentialsJson: string): boolean {
    try {
      const parsed = this.asRecord(JSON.parse(credentialsJson))
      const oauth = this.asRecord(parsed?.claudeAiOauth)
      return this.normalizeField(this.readString(oauth, 'accessToken')) !== null
    } catch {
      return false
    }
  }

  protected runtimeCredentialsAreFresher(
    runtimeCredentialsJson: string,
    managedCredentialsJson: string
  ): boolean {
    const runtimeFreshness = this.readFreshnessFromCredentials(runtimeCredentialsJson)
    const managedFreshness = this.readFreshnessFromCredentials(managedCredentialsJson)
    return (
      runtimeFreshness !== null && managedFreshness !== null && runtimeFreshness > managedFreshness
    )
  }

  protected runtimeCredentialsAreOlder(
    runtimeCredentialsJson: string,
    managedCredentialsJson: string
  ): boolean {
    const runtimeFreshness = this.readFreshnessFromCredentials(runtimeCredentialsJson)
    const managedFreshness = this.readFreshnessFromCredentials(managedCredentialsJson)
    return (
      runtimeFreshness !== null && managedFreshness !== null && runtimeFreshness < managedFreshness
    )
  }

  protected chooseFreshestReadBackCandidate(
    candidates: {
      credentialsJson: string
      match: Extract<ClaudeReadBackMatch, { kind: 'matched' }>
    }[]
  ): {
    credentialsJson: string
    match: Extract<ClaudeReadBackMatch, { kind: 'matched' }>
  } {
    return candidates.reduce((freshest, candidate) => {
      const candidateFreshness = this.readFreshnessFromCredentials(candidate.credentialsJson)
      const freshestFreshness = this.readFreshnessFromCredentials(freshest.credentialsJson)
      if (
        candidateFreshness !== null &&
        (freshestFreshness === null || candidateFreshness > freshestFreshness)
      ) {
        return candidate
      }
      return freshest
    })
  }
}
