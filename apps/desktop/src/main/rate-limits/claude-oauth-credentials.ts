import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import {
  readActiveClaudeKeychainCredentials,
  readActiveClaudeKeychainCredentialsStrict
} from '../claude/accounts/keychain'
import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'

type KeychainCredentials = {
  claudeAiOauth?: {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
  }
}

export type OAuthCredentialReadResult = {
  token: string | null
  hasRefreshableCredentials: boolean
  source: OAuthCredentialSource
  keychainUnavailable?: boolean
}

type OAuthCredentialReadOptions = {
  credentialsFileConfigDir?: string
  keychainConfigDir?: string
}

export type OAuthCredentialSource =
  | 'scoped-keychain'
  | 'legacy-keychain'
  | 'credentials-file'
  | 'none'

// Why: factored out so both the active-account Keychain reader and the
// managed-account reader share the same JSON parsing + refreshability check.
export function parseOAuthCredentialsJson(
  raw: string,
  source: OAuthCredentialSource
): OAuthCredentialReadResult {
  try {
    const parsed = JSON.parse(raw) as KeychainCredentials
    const oauth = parsed?.claudeAiOauth
    const token = oauth?.accessToken
    const refreshToken = oauth?.refreshToken
    const hasRefreshableCredentials = typeof refreshToken === 'string' && refreshToken.trim() !== ''
    if (!token || typeof token !== 'string') {
      return {
        token: null,
        hasRefreshableCredentials,
        source
      }
    }
    // Why: Claude's local expiresAt metadata is not authoritative for the
    // /api/oauth/usage endpoint. Real Claude Code 2.1 credentials have been
    // observed authenticating there after expiresAt, so let the server decide.
    return {
      token,
      hasRefreshableCredentials,
      source
    }
  } catch {
    return emptyOAuthCredentialReadResult()
  }
}

function emptyOAuthCredentialReadResult(): OAuthCredentialReadResult {
  return {
    token: null,
    hasRefreshableCredentials: false,
    source: 'none'
  }
}

function keychainUnavailableOAuthCredentialReadResult(): OAuthCredentialReadResult {
  return {
    token: null,
    hasRefreshableCredentials: false,
    source: 'none',
    keychainUnavailable: true
  }
}

/**
 * Read OAuth token from macOS Keychain.
 * Why: Claude Code 2.1+ scopes OAuth Keychain services by CLAUDE_CONFIG_DIR;
 * older builds used the legacy unsuffixed service. The shared reader handles both.
 */
async function readFromKeychain(configDir?: string): Promise<OAuthCredentialReadResult> {
  if (process.platform !== 'darwin') {
    return emptyOAuthCredentialReadResult()
  }

  if (configDir) {
    const scopedCredentials = await readCredentialsFromStrictKeychain(configDir, 'scoped-keychain')
    if (scopedCredentials.token) {
      return scopedCredentials
    }
    const legacyCredentials = await readCredentialsFromStrictKeychain(undefined, 'legacy-keychain')
    // Why: Yiru cannot refresh tokens itself, so an actual access token from
    // either item beats refresh-only credentials. A scoped item the CLI stopped
    // maintaining must not shadow a still-working legacy token.
    if (legacyCredentials.token) {
      return legacyCredentials
    }
    if (scopedCredentials.hasRefreshableCredentials) {
      return scopedCredentials
    }
    if (legacyCredentials.hasRefreshableCredentials) {
      return legacyCredentials
    }
    return scopedCredentials.keychainUnavailable || legacyCredentials.keychainUnavailable
      ? keychainUnavailableOAuthCredentialReadResult()
      : legacyCredentials
  }

  try {
    const credentials = await readActiveClaudeKeychainCredentials(configDir)
    return credentials
      ? parseOAuthCredentialsJson(credentials, 'legacy-keychain')
      : emptyOAuthCredentialReadResult()
  } catch {
    return keychainUnavailableOAuthCredentialReadResult()
  }
}

export async function readCredentialsFromStrictKeychain(
  configDir: string | undefined,
  source: OAuthCredentialSource
): Promise<OAuthCredentialReadResult> {
  try {
    const credentials = await readActiveClaudeKeychainCredentialsStrict(configDir)
    return credentials
      ? parseOAuthCredentialsJson(credentials, source)
      : emptyOAuthCredentialReadResult()
  } catch {
    return keychainUnavailableOAuthCredentialReadResult()
  }
}

/**
 * Read OAuth token from ~/.claude/.credentials.json (legacy path).
 * Why: older Claude CLI versions store credentials in this plain JSON
 * file. We keep it as a fallback for compatibility.
 */
async function readFromCredentialsFile(configDir?: string): Promise<OAuthCredentialReadResult> {
  const credPath = path.join(configDir ?? path.join(homedir(), '.claude'), '.credentials.json')
  try {
    const raw = await readFile(credPath, 'utf-8')
    return parseOAuthCredentialsJson(raw, 'credentials-file')
  } catch {
    return emptyOAuthCredentialReadResult()
  }
}

/**
 * Try credential sources that yield a genuine OAuth bearer token.
 * Why: we intentionally do NOT read ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY
 * here — those are API keys which return 401 on the OAuth usage endpoint.
 * API-key users are served by the PTY fallback instead.
 */
export async function readOAuthCredentials(
  options?: OAuthCredentialReadOptions
): Promise<OAuthCredentialReadResult> {
  // 1. macOS Keychain (Claude Max/Pro OAuth)
  const fromKeychain = await readFromKeychain(options?.keychainConfigDir)
  if (fromKeychain.token) {
    return fromKeychain
  }
  if (fromKeychain.hasRefreshableCredentials) {
    return fromKeychain
  }

  // 2. Legacy credentials file
  const fromFile = await readFromCredentialsFile(options?.credentialsFileConfigDir)
  if (fromFile.token) {
    return fromFile
  }
  if (fromFile.hasRefreshableCredentials) {
    return fromFile
  }

  if (fromKeychain.keychainUnavailable) {
    return fromKeychain
  }

  return emptyOAuthCredentialReadResult()
}

export function resolveOAuthCredentialReadOptions(
  authPreparation?: ClaudeRuntimeAuthPreparation
): OAuthCredentialReadOptions | undefined {
  if (!authPreparation) {
    return undefined
  }
  // Why: Claude Code 2.1+ can scope even the default config dir's macOS
  // Keychain item. Try scoped first, with legacy still handled as fallback.
  const readOptions: OAuthCredentialReadOptions = {
    credentialsFileConfigDir: authPreparation.configDir,
    keychainConfigDir: authPreparation.configDir
  }
  return readOptions
}
