import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import { toWindowsWslPath } from '~main/platform/wsl'
import { buildEncodedWslBashCommand } from '~main/platform/wsl-bash-command'

import { shellQuote } from './command-runner'
import {
  deleteManagedClaudeKeychainCredentials,
  readManagedClaudeKeychainCredentials,
  writeManagedClaudeKeychainCredentials
} from './keychain'
import type { CapturedClaudeAuth, ManagedClaudeAuthLocation } from './login'
import {
  getClaudeManagedAccountsRoot,
  readClaudeManagedAuthFile,
  resolveOwnedClaudeManagedAuthPath,
  writeClaudeManagedAuthFile
} from './managed-auth-path'

export type ClaudeAccountAddTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

export type ManagedClaudeAuthSnapshot = {
  credentialsJson: string | null
  oauthAccountJson: string | null
}

export class ClaudeManagedAuthStorage {
  resolvePath(candidatePath: string, expectedAccountId?: string): string {
    return this.assertPath(candidatePath, expectedAccountId)
  }

  create(accountId: string, target?: ClaudeAccountAddTarget): ManagedClaudeAuthLocation {
    const wslAuth = this.tryCreateWsl(accountId, target)
    if (wslAuth) {
      return wslAuth
    }
    const managedAuthPath = join(this.getAccountsRoot(), accountId, 'auth')
    mkdirSync(managedAuthPath, { recursive: true })
    writeFileSync(join(managedAuthPath, '.yiru-managed-claude-auth'), `${accountId}\n`, 'utf-8')
    return {
      managedAuthPath: this.assertPath(managedAuthPath, accountId),
      managedAuthRuntime: 'host',
      wslDistro: null,
      wslLinuxAuthPath: null
    }
  }

  async writeAuth(
    accountId: string,
    managedAuthPath: string,
    captured: CapturedClaudeAuth
  ): Promise<void> {
    await this.writeCredentials(accountId, managedAuthPath, captured.credentialsJson)
    await this.writeOauthAccount(accountId, managedAuthPath, captured.oauthAccount)
  }

  async writeCredentials(
    accountId: string,
    managedAuthPath: string,
    credentialsJson: string
  ): Promise<void> {
    const trustedPath = this.assertPath(managedAuthPath, accountId)
    if (process.platform === 'darwin') {
      await writeManagedClaudeKeychainCredentials(accountId, credentialsJson)
    } else {
      writeClaudeManagedAuthFile(trustedPath, '.credentials.json', credentialsJson)
    }
  }

  async writeOauthAccount(
    accountId: string,
    managedAuthPath: string,
    oauthAccount: unknown
  ): Promise<void> {
    const trustedPath = this.assertPath(managedAuthPath, accountId)
    writeClaudeManagedAuthFile(
      trustedPath,
      'oauth-account.json',
      `${JSON.stringify(oauthAccount, null, 2)}\n`
    )
  }

  async readSnapshot(
    accountId: string,
    managedAuthPath: string
  ): Promise<ManagedClaudeAuthSnapshot> {
    const trustedPath = this.assertPath(managedAuthPath, accountId)
    return {
      credentialsJson:
        process.platform === 'darwin'
          ? await readManagedClaudeKeychainCredentials(accountId)
          : readClaudeManagedAuthFile(trustedPath, '.credentials.json'),
      oauthAccountJson: readClaudeManagedAuthFile(trustedPath, 'oauth-account.json')
    }
  }

  async restoreCredentials(
    accountId: string,
    managedAuthPath: string,
    snapshot: ManagedClaudeAuthSnapshot
  ): Promise<void> {
    const trustedPath = this.assertPath(managedAuthPath, accountId)
    if (process.platform === 'darwin') {
      await (snapshot.credentialsJson !== null
        ? writeManagedClaudeKeychainCredentials(accountId, snapshot.credentialsJson)
        : deleteManagedClaudeKeychainCredentials(accountId))
    } else if (snapshot.credentialsJson !== null) {
      writeClaudeManagedAuthFile(trustedPath, '.credentials.json', snapshot.credentialsJson)
    } else {
      rmSync(join(trustedPath, '.credentials.json'), { force: true })
    }
  }

  restoreOauth(
    accountId: string,
    managedAuthPath: string,
    snapshot: ManagedClaudeAuthSnapshot
  ): void {
    const trustedPath = this.assertPath(managedAuthPath, accountId)
    if (snapshot.oauthAccountJson !== null) {
      writeClaudeManagedAuthFile(trustedPath, 'oauth-account.json', snapshot.oauthAccountJson)
    } else {
      rmSync(join(trustedPath, 'oauth-account.json'), { force: true })
    }
  }

  async safeRemove(accountId: string, candidatePath: string): Promise<void> {
    try {
      const managedAuthPath = this.assertPath(candidatePath, accountId)
      rmSync(resolve(managedAuthPath, '..'), { recursive: true, force: true })
    } catch (error) {
      console.warn('[claude-accounts] Refusing to remove untrusted managed auth:', error)
    }
    await deleteManagedClaudeKeychainCredentials(accountId)
  }

  private tryCreateWsl(
    accountId: string,
    target?: ClaudeAccountAddTarget
  ): ManagedClaudeAuthLocation | null {
    if (process.platform !== 'win32' || target?.runtime !== 'wsl') {
      return null
    }
    const distroArgs = target.wslDistro?.trim() ? ['-d', target.wslDistro.trim()] : []
    const infoOutput = execFileSync(
      'wsl.exe',
      [...distroArgs, '--', 'bash', '-lc', 'printf "%s\\n%s\\n" "$WSL_DISTRO_NAME" "$HOME"'],
      { encoding: 'utf-8', timeout: 5000 }
    )
    const [rawDistro, rawHome] = infoOutput
      .replaceAll(String.fromCharCode(0), '')
      .split(/\r?\n/)
      .map((line) => line.trim())
    const distro = target.wslDistro?.trim() || rawDistro
    if (!distro || !rawHome?.startsWith('/')) {
      throw new Error('Could not resolve the active WSL home directory for Claude login.')
    }
    const authPath = `${rawHome.replace(/\/$/, '')}/.local/share/yiru/claude-accounts/${accountId}/auth`
    const markerPath = `${authPath}/.yiru-managed-claude-auth`
    execFileSync(
      'wsl.exe',
      [
        '-d',
        distro,
        '--',
        'bash',
        '-lc',
        `mkdir -p ${shellQuote(authPath)} && printf '%s\\n' ${shellQuote(accountId)} > ${shellQuote(markerPath)}`
      ],
      { encoding: 'utf-8', timeout: 5000 }
    )
    const managedAuthPath = toWindowsWslPath(authPath, distro)
    return {
      managedAuthPath: this.assertPath(managedAuthPath, accountId),
      managedAuthRuntime: 'wsl',
      wslDistro: distro,
      wslLinuxAuthPath: authPath
    }
  }

  private assertPath(candidatePath: string, expectedAccountId?: string): string {
    const wslInfo = parseWslUncPath(candidatePath)
    if (wslInfo) {
      return this.assertWslPath(candidatePath, wslInfo, expectedAccountId)
    }
    this.getAccountsRoot()
    const accountId = expectedAccountId ?? this.readAccountIdFromPath(candidatePath)
    if (!accountId || (expectedAccountId && accountId !== expectedAccountId)) {
      throw new Error('Managed Claude auth directory does not exist on disk.')
    }
    const trustedPath = resolveOwnedClaudeManagedAuthPath(accountId, candidatePath, {
      adoptLegacyMarker: true
    })
    if (!trustedPath) {
      throw new Error('Managed Claude auth storage is not owned by Yiru.')
    }
    return trustedPath
  }

  private assertWslPath(
    candidatePath: string,
    wslInfo: NonNullable<ReturnType<typeof parseWslUncPath>>,
    expectedAccountId: string | undefined
  ): string {
    if (
      !wslInfo.linuxPath.includes('/.local/share/yiru/claude-accounts/') ||
      !wslInfo.linuxPath.endsWith('/auth')
    ) {
      throw new Error('Managed WSL Claude auth storage is outside Yiru account storage.')
    }
    if (process.platform !== 'win32') {
      if (
        !existsSync(candidatePath) ||
        !existsSync(join(candidatePath, '.yiru-managed-claude-auth'))
      ) {
        throw new Error('Managed Claude auth storage is not owned by Yiru.')
      }
      return candidatePath
    }
    try {
      const canonicalPath = execFileSync(
        'wsl.exe',
        [
          '-d',
          wslInfo.distro,
          '--',
          'bash',
          '-lc',
          buildEncodedWslBashCommand(
            [
              'set -euo pipefail',
              `candidate=${shellQuote(wslInfo.linuxPath)}`,
              'managed_root="${HOME%/}/.local/share/yiru/claude-accounts"',
              'candidate_real=$(readlink -f -- "$candidate")',
              'managed_root_real=$(readlink -f -- "$managed_root")',
              'test -f "$candidate_real/.yiru-managed-claude-auth"',
              expectedAccountId
                ? `test "$(cat "$candidate_real/.yiru-managed-claude-auth")" = ${shellQuote(expectedAccountId)}`
                : 'test -n "$(cat "$candidate_real/.yiru-managed-claude-auth")"',
              'case "$candidate_real" in "$managed_root_real"/*/auth) printf "%s\\n" "$candidate_real" ;; *) exit 35 ;; esac'
            ].join('\n')
          )
        ],
        { encoding: 'utf-8', timeout: 5000 }
      ).trim()
      if (!canonicalPath) {
        throw new Error('Managed Claude auth directory does not exist on disk.')
      }
      return toWindowsWslPath(canonicalPath, wslInfo.distro)
    } catch (error) {
      throw new Error('Managed WSL Claude auth storage is outside Yiru account storage.', {
        cause: error
      })
    }
  }

  private getAccountsRoot(): string {
    const root = getClaudeManagedAccountsRoot()
    mkdirSync(root, { recursive: true })
    return root
  }

  private readAccountIdFromPath(candidatePath: string): string | null {
    const relativePath = relative(resolve(this.getAccountsRoot()), resolve(candidatePath))
    const parts = relativePath.split(sep)
    return parts.length === 2 && parts[1] === 'auth' ? parts[0] : null
  }
}
