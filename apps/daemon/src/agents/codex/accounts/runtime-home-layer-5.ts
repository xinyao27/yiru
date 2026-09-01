import type { CodexAuthIdentity } from './runtime-home-foundation'
import { CodexRuntimeHomeLayer4 } from './runtime-home-layer-4'

export abstract class CodexRuntimeHomeLayer5 extends CodexRuntimeHomeLayer4 {
  protected runtimeAuthMatchesSystemDefaultIdentity(
    runtimeAuthContents: string,
    systemDefaultAuthContents: string
  ): boolean {
    const runtimeIdentity = this.readIdentityFromAuthContents(runtimeAuthContents)
    const systemDefaultIdentity = this.readIdentityFromAuthContents(systemDefaultAuthContents)
    if (!runtimeIdentity || !systemDefaultIdentity) {
      return false
    }

    // Why: stale managed Codex PTYs share the same runtime home. Only read a
    // runtime refresh back into ~/.codex when the auth still claims the same
    // system-default identity Yiru mirrored earlier.
    if (
      systemDefaultIdentity.email &&
      runtimeIdentity.email &&
      systemDefaultIdentity.email !== runtimeIdentity.email
    ) {
      return false
    }
    if (
      !this.identityFieldMatches(
        systemDefaultIdentity.providerAccountId,
        runtimeIdentity.providerAccountId
      )
    ) {
      return false
    }
    if (
      !this.identityFieldMatches(
        systemDefaultIdentity.workspaceAccountId,
        runtimeIdentity.workspaceAccountId
      )
    ) {
      return false
    }

    const strongIdentityMatches = Boolean(
      (systemDefaultIdentity.providerAccountId && runtimeIdentity.providerAccountId) ||
      (systemDefaultIdentity.workspaceAccountId && runtimeIdentity.workspaceAccountId)
    )
    const emailMatches = Boolean(
      systemDefaultIdentity.email &&
      runtimeIdentity.email &&
      systemDefaultIdentity.email === runtimeIdentity.email
    )
    return (
      strongIdentityMatches ||
      (emailMatches && !runtimeIdentity.providerAccountId && !runtimeIdentity.workspaceAccountId)
    )
  }

  protected runtimeAuthIsFresher(
    runtimeAuthContents: string,
    managedAuthContents: string
  ): boolean {
    const runtimeFreshness = this.readFreshnessFromAuthContents(runtimeAuthContents)
    const managedFreshness = this.readFreshnessFromAuthContents(managedAuthContents)
    return (
      runtimeFreshness !== null && managedFreshness !== null && runtimeFreshness > managedFreshness
    )
  }

  protected identityFieldMatches(
    selectedField: string | null,
    runtimeField: string | null
  ): boolean {
    return !selectedField || Boolean(runtimeField && selectedField === runtimeField)
  }

  protected firstNonNull(...values: (string | null | undefined)[]): string | null {
    return values.find((value): value is string => Boolean(value)) ?? null
  }

  protected readIdentityFromAuthContents(contents: string): CodexAuthIdentity | null {
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(contents) as Record<string, unknown>
    } catch {
      return null
    }

    const tokens = this.readRecordClaim(raw, 'tokens')
    const idToken = this.normalizeField(
      this.readStringClaim(tokens, 'id_token') ?? this.readStringClaim(tokens, 'idToken')
    )
    const payload = idToken ? this.parseJwtPayload(idToken) : null
    const authClaims = this.readRecordClaim(payload, 'https://api.openai.com/auth')
    const profileClaims = this.readRecordClaim(payload, 'https://api.openai.com/profile')

    return {
      email: this.normalizeField(
        this.readStringClaim(payload, 'email') ?? this.readStringClaim(profileClaims, 'email')
      ),
      providerAccountId: this.normalizeField(
        this.readStringClaim(tokens, 'account_id') ??
          this.readStringClaim(tokens, 'accountId') ??
          this.readStringClaim(authClaims, 'chatgpt_account_id') ??
          this.readStringClaim(payload, 'chatgpt_account_id')
      ),
      workspaceAccountId: this.normalizeField(
        this.readStringClaim(authClaims, 'workspace_account_id') ??
          this.readStringClaim(tokens, 'account_id') ??
          this.readStringClaim(tokens, 'accountId') ??
          this.readStringClaim(payload, 'chatgpt_account_id')
      )
    }
  }

  protected readFreshnessFromAuthContents(contents: string): number | null {
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(contents) as Record<string, unknown>
    } catch {
      return null
    }

    const tokens = this.readRecordClaim(raw, 'tokens')
    const idToken = this.normalizeField(
      this.readStringClaim(tokens, 'id_token') ?? this.readStringClaim(tokens, 'idToken')
    )
    const payload = idToken ? this.parseJwtPayload(idToken) : null
    return (
      this.readNumberClaim(tokens, 'expires_at') ??
      this.readNumberClaim(tokens, 'expiresAt') ??
      this.readNumberClaim(tokens, 'expiry') ??
      this.readNumberClaim(tokens, 'expires') ??
      this.readNumberClaim(payload, 'exp') ??
      this.readNumberClaim(payload, 'iat')
    )
  }

  protected parseJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length < 2) {
      return null
    }

    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (payload.length % 4 !== 0) {
      payload += '='
    }

    try {
      const json = Buffer.from(payload, 'base64').toString('utf-8')
      return JSON.parse(json) as Record<string, unknown>
    } catch {
      return null
    }
  }

  protected readRecordClaim(
    value: Record<string, unknown> | null,
    key: string
  ): Record<string, unknown> | null {
    const claim = value?.[key]
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
      return null
    }
    return claim as Record<string, unknown>
  }

  protected readStringClaim(value: Record<string, unknown> | null, key: string): string | null {
    const claim = value?.[key]
    return typeof claim === 'string' ? claim : null
  }

  protected readNumberClaim(value: Record<string, unknown> | null, key: string): number | null {
    const claim = value?.[key]
    if (typeof claim === 'number' && Number.isFinite(claim)) {
      return claim
    }
    if (typeof claim === 'string') {
      const parsed = Number(claim)
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
}
