import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CodexSystemDefaultIdentity } from '@yiru/runtime-protocol/workbench/types'

export type ResolvedCodexIdentity = {
  email: string | null
  providerAccountId: string | null
  workspaceLabel: string | null
  workspaceAccountId: string | null
}

type CodexOAuthCredentials = {
  idToken: string | null
  accountId: string | null
}

export class CodexAccountIdentity {
  resolveSystemDefault(): CodexSystemDefaultIdentity {
    let contents: string
    try {
      contents = readFileSync(join(homedir(), '.codex', 'auth.json'), 'utf-8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        console.warn('[codex-accounts] Failed to read system-default Codex identity', code)
      }
      const envKey = process.env.OPENAI_API_KEY?.trim()
      return {
        hasAuth: code !== 'ENOENT' && code !== 'ENOTDIR',
        authKind: envKey ? 'api-key' : 'none',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      console.warn('[codex-accounts] System-default Codex auth is not valid JSON')
      return {
        hasAuth: true,
        authKind: 'none',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('[codex-accounts] System-default Codex auth has an unexpected format')
      return {
        hasAuth: true,
        authKind: 'none',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    const raw = parsed as Record<string, unknown>
    if (typeof raw.OPENAI_API_KEY === 'string' && raw.OPENAI_API_KEY.trim()) {
      return {
        hasAuth: true,
        authKind: 'api-key',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    const tokens = this.readRecordClaim(raw, 'tokens')
    const idToken = this.normalizeField(
      this.readStringClaim(tokens, 'id_token') ?? this.readStringClaim(tokens, 'idToken')
    )
    const payload = idToken ? this.parseJwtPayload(idToken) : null
    const authClaims = this.readRecordClaim(payload, 'https://api.openai.com/auth')
    const profileClaims = this.readRecordClaim(payload, 'https://api.openai.com/profile')
    return {
      hasAuth: true,
      authKind: 'oauth',
      email: this.normalizeField(
        this.readStringClaim(payload, 'email') ?? this.readStringClaim(profileClaims, 'email')
      ),
      providerAccountId: this.normalizeField(
        this.readStringClaim(tokens, 'account_id') ??
          this.readStringClaim(authClaims, 'chatgpt_account_id')
      ),
      workspaceLabel: this.normalizeField(
        this.readStringClaim(authClaims, 'workspace_name') ??
          this.readStringClaim(profileClaims, 'workspace_name')
      )
    }
  }

  readFromHome(managedHomePath: string): ResolvedCodexIdentity {
    const credentials = this.loadOAuthCredentials(managedHomePath)
    const payload = credentials.idToken ? this.parseJwtPayload(credentials.idToken) : null
    const authClaims = this.readRecordClaim(payload, 'https://api.openai.com/auth')
    const profileClaims = this.readRecordClaim(payload, 'https://api.openai.com/profile')

    return {
      email: this.normalizeField(
        this.readStringClaim(payload, 'email') ?? this.readStringClaim(profileClaims, 'email')
      ),
      providerAccountId: this.normalizeField(
        credentials.accountId ??
          this.readStringClaim(authClaims, 'chatgpt_account_id') ??
          this.readStringClaim(payload, 'chatgpt_account_id')
      ),
      workspaceLabel: this.normalizeField(
        this.readStringClaim(authClaims, 'workspace_name') ??
          this.readStringClaim(profileClaims, 'workspace_name')
      ),
      workspaceAccountId: this.normalizeField(
        this.readStringClaim(authClaims, 'workspace_account_id') ??
          credentials.accountId ??
          this.readStringClaim(payload, 'chatgpt_account_id')
      )
    }
  }

  private loadOAuthCredentials(managedHomePath: string): CodexOAuthCredentials {
    const authFilePath = join(managedHomePath, 'auth.json')
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(readFileSync(authFilePath, 'utf-8')) as Record<string, unknown>
    } catch {
      // Why: SyntaxError can echo credential bytes into logs or UI.
      throw new Error('Codex auth.json is corrupt or not valid JSON')
    }

    // Why: API-key-based auth files have no OAuth tokens or JWT identity
    // claims. Returning nulls causes the caller to fail with a clear
    // "could not resolve the account email" error rather than crashing
    // on missing nested token fields.
    if (typeof raw.OPENAI_API_KEY === 'string' && raw.OPENAI_API_KEY.trim() !== '') {
      return {
        idToken: null,
        accountId: null
      }
    }

    const tokens = this.readRecordClaim(raw, 'tokens')
    return {
      idToken: this.normalizeField(
        this.readStringClaim(tokens, 'id_token') ?? this.readStringClaim(tokens, 'idToken')
      ),
      accountId: this.normalizeField(
        this.readStringClaim(tokens, 'account_id') ?? this.readStringClaim(tokens, 'accountId')
      )
    }
  }

  private parseJwtPayload(token: string): Record<string, unknown> | null {
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

  private readRecordClaim(
    value: Record<string, unknown> | null,
    key: string
  ): Record<string, unknown> | null {
    const claim = value?.[key]
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
      return null
    }
    return claim as Record<string, unknown>
  }

  private readStringClaim(value: Record<string, unknown> | null, key: string): string | null {
    const claim = value?.[key]
    return typeof claim === 'string' ? claim : null
  }

  private normalizeField(value: string | null | undefined): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
}
