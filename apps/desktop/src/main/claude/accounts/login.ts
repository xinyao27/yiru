import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { toWindowsWslPath } from '~main/wsl'

import { runClaudeCommand, shellQuote, type ClaudeLoginConfigDir } from './command-runner'
import {
  deleteActiveClaudeKeychainCredentialsStrict,
  readActiveClaudeKeychainCredentials,
  readActiveClaudeKeychainCredentialsStrict,
  writeActiveClaudeKeychainCredentials
} from './keychain'

const LOGIN_TIMEOUT_MS = 180_000
const STATUS_TIMEOUT_MS = 20_000

type ClaudeIdentity = {
  email: string | null
  organizationUuid: string | null
  organizationName: string | null
}

export type CapturedClaudeAuth = {
  credentialsJson: string
  oauthAccount: unknown
  identity: ClaudeIdentity
}

export type ManagedClaudeAuthLocation = {
  managedAuthPath: string
  managedAuthRuntime: 'host' | 'wsl'
  wslDistro: string | null
  wslLinuxAuthPath: string | null
}

export class ClaudeAccountLogin {
  private cancelPendingLogin: (() => boolean) | null = null

  cancel(): boolean {
    return this.cancelPendingLogin?.() ?? false
  }

  async run(location: ManagedClaudeAuthLocation): Promise<CapturedClaudeAuth> {
    const tempConfig = this.createTemporaryConfigDir(location)
    const abortController = new AbortController()
    this.cancelPendingLogin = () => {
      if (abortController.signal.aborted) {
        return false
      }
      abortController.abort()
      return true
    }
    const previousLegacyKeychain = await readActiveClaudeKeychainCredentials()
    let captured: CapturedClaudeAuth | null = null
    let captureError: unknown = null
    let cleanupError: unknown = null
    try {
      if (abortController.signal.aborted) {
        throw new Error('Claude sign-in was cancelled.')
      }
      await runClaudeCommand(['auth', 'login', '--claudeai'], tempConfig, LOGIN_TIMEOUT_MS, {
        signal: abortController.signal,
        keepStdinOpen: true
      })
      this.cancelPendingLogin = null
      const status = await runClaudeCommand(
        ['auth', 'status', '--json'],
        tempConfig,
        STATUS_TIMEOUT_MS,
        { allowFailure: true }
      )
      captured = await this.capture(tempConfig.windowsPath, status, previousLegacyKeychain)
    } catch (error) {
      captureError = error
    } finally {
      if (process.platform === 'darwin') {
        try {
          await deleteActiveClaudeKeychainCredentialsStrict(tempConfig.windowsPath)
        } catch (error) {
          console.warn('[claude-accounts] Failed to clean temporary Claude Keychain item:', error)
        }
        try {
          // Why: older Claude versions ignored CLAUDE_CONFIG_DIR and wrote the
          // legacy active Keychain item. Preserve that external CLI state.
          await (previousLegacyKeychain
            ? writeActiveClaudeKeychainCredentials(previousLegacyKeychain)
            : deleteActiveClaudeKeychainCredentialsStrict())
        } catch (error) {
          cleanupError = error
        }
      }
      this.removeTemporaryConfigDir(tempConfig)
      this.cancelPendingLogin = null
    }
    if (captureError) {
      throw captureError
    }
    if (cleanupError) {
      throw cleanupError
    }
    if (!captured) {
      throw new Error('Claude login completed without captured credentials.')
    }
    return captured
  }

  private createTemporaryConfigDir(location: ManagedClaudeAuthLocation): ClaudeLoginConfigDir {
    if (location.managedAuthRuntime !== 'wsl') {
      return {
        windowsPath: mkdtempSync(join(tmpdir(), 'yiru-claude-login-')),
        linuxPath: null,
        wslDistro: null
      }
    }
    if (!location.wslDistro) {
      throw new Error('Could not resolve the active WSL distribution for Claude login.')
    }
    const linuxPath = execFileSync(
      'wsl.exe',
      [
        '-d',
        location.wslDistro,
        '--',
        'bash',
        '-lc',
        'mktemp -d "${TMPDIR:-/tmp}/yiru-claude-login.XXXXXX"'
      ],
      { encoding: 'utf-8', timeout: 5000 }
    )
      .replaceAll(String.fromCharCode(0), '')
      .trim()
    if (!linuxPath.startsWith('/')) {
      throw new Error('Could not create a temporary WSL Claude login directory.')
    }
    return {
      windowsPath: toWindowsWslPath(linuxPath, location.wslDistro),
      linuxPath,
      wslDistro: location.wslDistro
    }
  }

  private removeTemporaryConfigDir(config: ClaudeLoginConfigDir): void {
    if (config.linuxPath && config.wslDistro) {
      try {
        execFileSync(
          'wsl.exe',
          [
            '-d',
            config.wslDistro,
            '--',
            'bash',
            '-lc',
            `rm -rf -- ${shellQuote(config.linuxPath)}`
          ],
          { encoding: 'utf-8', timeout: 5000 }
        )
      } catch {
        // Best-effort cleanup.
      }
      return
    }
    rmSync(config.windowsPath, { recursive: true, force: true })
  }

  private async capture(
    configDir: string,
    statusOutput: string,
    previousLegacyKeychain: string | null
  ): Promise<CapturedClaudeAuth> {
    const credentialsJson = await this.readCapturedCredentials(configDir, previousLegacyKeychain)
    if (!credentialsJson) {
      throw new Error('Claude login completed, but no OAuth credentials were captured.')
    }
    const oauthAccount = this.readOauthAccount(configDir)
    return {
      credentialsJson,
      oauthAccount,
      identity: resolveIdentity(statusOutput, oauthAccount, credentialsJson)
    }
  }

  private async readCapturedCredentials(
    configDir: string,
    previousLegacyKeychain: string | null
  ): Promise<string | null> {
    if (process.platform === 'darwin') {
      const scopedCredentials = await readActiveClaudeKeychainCredentialsStrict(configDir)
      if (scopedCredentials) {
        return scopedCredentials
      }
      const legacyCredentials = await readActiveClaudeKeychainCredentialsStrict()
      if (legacyCredentials && legacyCredentials !== previousLegacyKeychain) {
        return legacyCredentials
      }
    }
    const credentialsPath = join(configDir, '.credentials.json')
    return existsSync(credentialsPath) ? readFileSync(credentialsPath, 'utf-8') : null
  }

  private readOauthAccount(configDir: string): unknown {
    for (const configPath of [join(configDir, '.claude.json'), join(configDir, '.config.json')]) {
      if (!existsSync(configPath)) {
        continue
      }
      try {
        const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
        if (parsed.oauthAccount) {
          return parsed.oauthAccount
        }
      } catch {
        continue
      }
    }
    return null
  }
}

function resolveIdentity(
  statusOutput: string,
  oauthAccount: unknown,
  credentialsJson: string
): ClaudeIdentity {
  const status = parseJsonObject(statusOutput)
  const oauth = asRecord(oauthAccount)
  const credentials = parseJsonObject(credentialsJson)
  const credentialOauth = asRecord(credentials?.claudeAiOauth)
  return {
    email: normalizeField(
      readString(status, 'email') ??
        readString(oauth, 'emailAddress') ??
        readString(oauth, 'email') ??
        readString(credentialOauth, 'email')
    ),
    organizationUuid: normalizeField(
      readString(status, 'organizationUuid') ??
        readString(status, 'organizationId') ??
        readString(oauth, 'organizationUuid') ??
        readString(oauth, 'organizationId')
    ),
    organizationName: normalizeField(
      readString(status, 'organizationName') ?? readString(oauth, 'organizationName')
    )
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: Record<string, unknown> | null, key: string): string | null {
  const field = value?.[key]
  return typeof field === 'string' ? field : null
}

function normalizeField(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
