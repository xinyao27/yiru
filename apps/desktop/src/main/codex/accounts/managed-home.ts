import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { toWindowsWslPath } from '~main/wsl'
import { buildEncodedWslBashCommand } from '~main/wsl-bash-command'
import type { CodexManagedAccount } from '~shared/types'

import { CodexManagedHomeOwnership, getCodexManagedAccountsRoot } from './managed-home-ownership'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export type CodexAccountAddTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

type ManagedHomeLocation = {
  managedHomePath: string
  managedHomeRuntime: 'host' | 'wsl'
  wslDistro: string | null
  wslLinuxHomePath: string | null
}

export class CodexManagedHome {
  private readonly ownership = new CodexManagedHomeOwnership()
  create(accountId: string, target?: CodexAccountAddTarget): ManagedHomeLocation {
    const wslHome = this.tryCreateWslManagedHome(accountId, target)
    if (wslHome) {
      return wslHome
    }

    const managedHomePath = join(getCodexManagedAccountsRoot(), accountId, 'home')
    mkdirSync(managedHomePath, { recursive: true })
    // Why: Codex expects CODEX_HOME to be a concrete directory it can own. We
    // pre-create the directory and leave a marker so future cleanup code can
    // prove the path belongs to Yiru before deleting anything.
    writeFileSync(join(managedHomePath, '.yiru-managed-home'), `${accountId}\n`, 'utf-8')
    return {
      managedHomePath: this.ownership.assertPath(managedHomePath, accountId),
      managedHomeRuntime: 'host',
      wslDistro: null,
      wslLinuxHomePath: null
    }
  }

  private tryCreateWslManagedHome(
    accountId: string,
    target?: CodexAccountAddTarget
  ): ManagedHomeLocation | null {
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
    const home = rawHome
    if (!distro || !home?.startsWith('/')) {
      throw new Error('Could not resolve the active WSL home directory for Codex login.')
    }

    const wslLinuxHomePath = `${home.replace(/\/$/, '')}/.local/share/yiru/codex-accounts/${accountId}/home`
    const markerPath = `${wslLinuxHomePath}/.yiru-managed-home`
    execFileSync(
      'wsl.exe',
      [
        '-d',
        distro,
        '--',
        'bash',
        '-lc',
        `mkdir -p ${shellQuote(wslLinuxHomePath)} && printf '%s\\n' ${shellQuote(accountId)} > ${shellQuote(markerPath)}`
      ],
      { encoding: 'utf-8', timeout: 5000 }
    )

    const managedHomePath = toWindowsWslPath(wslLinuxHomePath, distro)
    let trustedManagedHomePath: string
    try {
      trustedManagedHomePath = this.ownership.assertPath(managedHomePath, accountId)
    } catch (error) {
      this.ownership.cleanupCandidate(distro, wslLinuxHomePath, accountId)
      throw error
    }

    return {
      managedHomePath: trustedManagedHomePath,
      managedHomeRuntime: 'wsl',
      wslDistro: distro,
      wslLinuxHomePath
    }
  }

  ensureForReauthentication(account: CodexManagedAccount): string {
    const wslInfo = parseWslUncPath(account.managedHomePath)
    if (wslInfo && process.platform === 'win32') {
      this.ensureExpectedWslManagedHomeForReauthentication(account, wslInfo)
      return this.ownership.assertPath(account.managedHomePath, account.id)
    }

    try {
      return this.ownership.assertPath(account.managedHomePath, account.id)
    } catch (error) {
      if (!this.isMissingManagedHomeError(error)) {
        throw error
      }
      return this.recreateExpectedHostManagedHomeForReauthentication(account, error)
    }
  }

  private recreateExpectedHostManagedHomeForReauthentication(
    account: CodexManagedAccount,
    originalError: unknown
  ): string {
    const expectedManagedHomePath = join(getCodexManagedAccountsRoot(), account.id, 'home')
    if (!this.pathsEqual(account.managedHomePath, expectedManagedHomePath)) {
      throw originalError
    }

    // Why: explicit re-auth is allowed to recover from a lost empty container,
    // but only at the exact Yiru-owned account path persisted for this account.
    mkdirSync(expectedManagedHomePath, { recursive: true })
    writeFileSync(join(expectedManagedHomePath, '.yiru-managed-home'), `${account.id}\n`, 'utf-8')
    return this.ownership.assertPath(expectedManagedHomePath, account.id)
  }

  private ensureExpectedWslManagedHomeForReauthentication(
    account: CodexManagedAccount,
    wslInfo: { distro: string; linuxPath: string }
  ): void {
    if (
      account.managedHomeRuntime !== 'wsl' ||
      account.wslDistro !== wslInfo.distro ||
      account.wslLinuxHomePath !== wslInfo.linuxPath ||
      !wslInfo.linuxPath.endsWith(`/.local/share/yiru/codex-accounts/${account.id}/home`)
    ) {
      return
    }

    execFileSync(
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
            `expected_marker=${shellQuote(account.id)}`,
            'marker="$candidate/.yiru-managed-home"',
            'if [ -e "$candidate" ] && [ ! -f "$marker" ]; then exit 41; fi',
            'if [ -f "$marker" ] && [ "$(cat "$marker")" != "$expected_marker" ]; then exit 42; fi',
            'mkdir -p -- "$candidate"',
            'printf "%s\\n" "$expected_marker" > "$marker"'
          ].join('\n')
        )
      ],
      { encoding: 'utf-8', timeout: 5000 }
    )
  }

  private isMissingManagedHomeError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message === 'Managed Codex home directory does not exist on disk.'
    )
  }

  private pathsEqual(left: string, right: string): boolean {
    const resolvedLeft = resolve(left)
    const resolvedRight = resolve(right)
    return process.platform === 'win32'
      ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
      : resolvedLeft === resolvedRight
  }

  assertPath(candidatePath: string, expectedAccountId?: string): string {
    return this.ownership.assertPath(candidatePath, expectedAccountId)
  }

  remove(candidatePath: string, expectedAccountId: string): void {
    this.ownership.remove(candidatePath, expectedAccountId)
  }
}
