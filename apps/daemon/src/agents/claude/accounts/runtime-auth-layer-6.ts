import type { ClaudeManagedAccount } from '@yiru/runtime-protocol/workbench/types'

import {
  readManagedClaudeKeychainCredentials,
  writeManagedClaudeKeychainCredentials
} from './keychain'
import { readClaudeManagedAuthFile, writeClaudeManagedAuthFile } from './managed-auth-path'
import { isOauthTokenExpiring, refreshClaudeOauthCredentials } from './oauth-refresh'
import type { ClaudeAuthIdentity, ClaudeRefreshTokenComparison } from './runtime-auth-foundation'
import { ClaudeRuntimeAuthLayer5 } from './runtime-auth-layer-5'

export abstract class ClaudeRuntimeAuthLayer6 extends ClaudeRuntimeAuthLayer5 {
  protected readFreshnessFromCredentials(credentialsJson: string): number | null {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(credentialsJson) as Record<string, unknown>
    } catch {
      return null
    }
    const oauth = this.asRecord(parsed.claudeAiOauth)
    return (
      this.readNumber(oauth, 'expiresAt') ??
      this.readNumber(oauth, 'expires_at') ??
      this.readNumber(oauth, 'expiry') ??
      this.readNumber(oauth, 'expires')
    )
  }

  protected compareRefreshTokens(
    runtimeCredentialsJson: string,
    managedCredentialsJson: string
  ): ClaudeRefreshTokenComparison {
    const runtimeRefreshToken = this.readRefreshTokenFromCredentials(runtimeCredentialsJson)
    const managedRefreshToken = this.readRefreshTokenFromCredentials(managedCredentialsJson)
    if (!runtimeRefreshToken || !managedRefreshToken) {
      return 'missing'
    }
    return runtimeRefreshToken === managedRefreshToken ? 'same' : 'different'
  }

  protected readRefreshTokenFromCredentials(credentialsJson: string): string | null {
    try {
      const parsed = JSON.parse(credentialsJson) as Record<string, unknown>
      const oauth = this.asRecord(parsed.claudeAiOauth)
      return this.normalizeField(this.readString(oauth, 'refreshToken'))
    } catch {
      return null
    }
  }

  protected readIdentityFromOauthAccount(oauthAccount: unknown): ClaudeAuthIdentity {
    const oauth = this.asRecord(oauthAccount)
    return {
      accountUuid: this.normalizeField(
        this.readString(oauth, 'accountUuid') ?? this.readString(oauth, 'accountId')
      ),
      email: this.normalizeField(
        this.readString(oauth, 'emailAddress') ?? this.readString(oauth, 'email')
      ),
      organizationUuid: this.normalizeField(
        this.readString(oauth, 'organizationUuid') ?? this.readString(oauth, 'organizationId')
      )
    }
  }

  protected asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }
    return value as Record<string, unknown>
  }

  protected readString(value: Record<string, unknown> | null, key: string): string | null {
    const candidate = value?.[key]
    return typeof candidate === 'string' ? candidate : null
  }

  protected readNumber(value: Record<string, unknown> | null, key: string): number | null {
    const candidate = value?.[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
    if (typeof candidate === 'string') {
      const parsed = Number(candidate)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  protected normalizeField(value: string | null | undefined): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  protected async readManagedCredentials(account: ClaudeManagedAccount): Promise<string | null> {
    const managedAuthPath = this.getOwnedManagedAuthPath(account)
    if (!managedAuthPath) {
      return null
    }
    if (process.platform === 'darwin') {
      return readManagedClaudeKeychainCredentials(account.id)
    }
    return readClaudeManagedAuthFile(managedAuthPath, '.credentials.json')
  }

  protected async writeManagedCredentials(
    account: ClaudeManagedAccount,
    credentialsJson: string
  ): Promise<void> {
    const managedAuthPath = this.getOwnedManagedAuthPath(account)
    if (!managedAuthPath) {
      throw new Error('Managed Claude auth storage is not owned by Yiru.')
    }
    if (process.platform === 'darwin') {
      await writeManagedClaudeKeychainCredentials(account.id, credentialsJson)
      return
    }
    writeClaudeManagedAuthFile(managedAuthPath, '.credentials.json', credentialsJson)
  }

  /**
   * Proactively refresh an account's OAuth token and persist the rotation to
   * managed storage. Returns the refreshed credentials JSON when a rotation was
   * stored, or null when no refresh happened (token still valid, no refresh
   * token, or the network call failed — in which case the caller keeps the
   * existing credentials, never worse than before).
   *
   * Caller guarantees this account is not the live/active one and runs inside
   * the serialized mutation queue, so a single-use refresh token can't be
   * rotated concurrently.
   */

  protected async refreshManagedAccountTokenIfNeeded(
    account: ClaudeManagedAccount,
    credentialsJson: string
  ): Promise<string | null> {
    if (!isOauthTokenExpiring(credentialsJson)) {
      return null
    }
    const refreshed = await refreshClaudeOauthCredentials(credentialsJson)
    if (!refreshed || !this.isValidCredentialsJsonObject(refreshed)) {
      return null
    }
    try {
      await this.writeManagedCredentials(account, refreshed)
    } catch (error) {
      console.warn('[claude-runtime-auth] Failed to persist refreshed Claude token:', error)
      return null
    }
    return refreshed
  }

  protected readManagedOauthAccount(account: ClaudeManagedAccount): unknown {
    const managedAuthPath = this.getOwnedManagedAuthPath(account)
    if (!managedAuthPath) {
      return null
    }
    try {
      const contents = readClaudeManagedAuthFile(managedAuthPath, 'oauth-account.json')
      return contents ? (JSON.parse(contents) as unknown) : null
    } catch {
      return null
    }
  }
}
