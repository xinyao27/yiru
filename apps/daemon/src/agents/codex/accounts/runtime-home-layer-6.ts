import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, win32 as pathWin32 } from 'node:path'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import type { CodexManagedAccount } from '@yiru/runtime-protocol/workbench/types'
import { getDefaultWslDistro } from '~main/hosts/capabilities'

import { writeFileAtomically } from './atomic-file-operations'
import type { CodexReadBackMatch } from './runtime-home-foundation'
import { prepareWslRuntimeSeedConfig } from './runtime-home-foundation'
import { CodexRuntimeHomeLayer5 } from './runtime-home-layer-5'
import type { CodexAccountSelectionTarget } from './runtime-selection'

export abstract class CodexRuntimeHomeLayer6 extends CodexRuntimeHomeLayer5 {
  protected migrateLegacyWslActiveHomePointer(distro: string, runtimeHomePath: string): void {
    const runtimeWsl = parseWslUncPath(runtimeHomePath)
    if (!runtimeWsl?.linuxPath.endsWith('/codex-runtime-home/home')) {
      return
    }
    const activeLinuxPath = runtimeWsl.linuxPath.replace(
      /\/codex-runtime-home\/home$/,
      '/codex-runtime-home/active/wsl/home'
    )
    const nextLinuxPath = `${activeLinuxPath}.next-${process.pid}-${Date.now()}`
    const activeLinuxParentPath = this.dirnameLinuxPath(activeLinuxPath)
    // Why: WSL drops bash argv here and login-shell cleanup can turn explicit
    // `exit 0` into status 1, so keep this script literal and fall-through.
    execFileSync(
      'wsl.exe',
      [
        '-d',
        distro,
        '--',
        'bash',
        '-lc',
        [
          'set -e',
          `if [ ! -e ${this.quoteBashString(activeLinuxPath)} ] && [ ! -L ${this.quoteBashString(activeLinuxPath)} ]; then :`,
          `elif [ -e ${this.quoteBashString(activeLinuxPath)} ] && [ ! -L ${this.quoteBashString(activeLinuxPath)} ]; then :`,
          'else',
          `mkdir -p ${this.quoteBashString(activeLinuxParentPath)}`,
          `rm -rf -- ${this.quoteBashString(nextLinuxPath)}`,
          `ln -s -- ${this.quoteBashString(runtimeWsl.linuxPath)} ${this.quoteBashString(nextLinuxPath)}`,
          `mv -Tf -- ${this.quoteBashString(nextLinuxPath)} ${this.quoteBashString(activeLinuxPath)}`,
          'fi'
        ].join('\n')
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }
    )
  }

  protected dirnameLinuxPath(value: string): string {
    const index = value.lastIndexOf('/')
    return index > 0 ? value.slice(0, index) : '/'
  }

  protected quoteBashString(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
  }

  protected joinWslPath(basePath: string, ...segments: string[]): string {
    return parseWslUncPath(basePath)
      ? pathWin32.join(basePath, ...segments)
      : join(basePath, ...segments)
  }

  protected resolveWslDefaultTarget(
    target: CodexAccountSelectionTarget
  ): CodexAccountSelectionTarget {
    if (target.runtime !== 'wsl' || target.wslDistro?.trim()) {
      return target
    }
    const defaultDistro = getDefaultWslDistro()
    return defaultDistro ? { runtime: 'wsl', wslDistro: defaultDistro } : target
  }

  protected getWslSystemCodexAuthPath(target: CodexAccountSelectionTarget): string | null {
    const home = this.getWslSystemCodexHomePath(target)
    return home ? this.joinWslPath(home, 'auth.json') : null
  }

  protected seedWslRuntimeHome(
    runtimeHomePath: string,
    activeAccount: CodexManagedAccount | null,
    distro: string
  ): void {
    const runtimeConfigPath = join(runtimeHomePath, 'config.toml')
    if (existsSync(runtimeConfigPath)) {
      return
    }

    const candidateHomes = [
      activeAccount?.managedHomePath,
      this.getWslSystemCodexHomePath({ runtime: 'wsl', wslDistro: distro })
    ].filter((value): value is string => Boolean(value))
    for (const homePath of candidateHomes) {
      const configPath = join(homePath, 'config.toml')
      if (existsSync(configPath)) {
        writeFileAtomically(
          runtimeConfigPath,
          prepareWslRuntimeSeedConfig(readFileSync(configPath, 'utf-8'), homePath)
        )
        return
      }
    }
  }

  protected findManagedAccountForRuntimeAuth(
    runtimeAuthContents: string,
    expectedAccountId?: string
  ): CodexReadBackMatch {
    const matches: {
      account: CodexManagedAccount
      managedAuthPath: string
      managedAuthContents: string
    }[] = []
    for (const account of this.store.getSettings().codexManagedAccounts) {
      if (expectedAccountId && account.id !== expectedAccountId) {
        continue
      }
      const managedAuthPath = join(account.managedHomePath, 'auth.json')
      if (!existsSync(managedAuthPath)) {
        continue
      }
      const managedAuthContents = readFileSync(managedAuthPath, 'utf-8')
      if (this.runtimeAuthMatchesAccount(runtimeAuthContents, account, managedAuthContents)) {
        matches.push({ account, managedAuthPath, managedAuthContents })
      }
    }

    if (matches.length === 1) {
      return { kind: 'matched', ...matches[0] }
    }
    return { kind: matches.length === 0 ? 'none' : 'ambiguous' }
  }

  protected runtimeAuthMatchesAccount(
    runtimeAuthContents: string,
    activeAccount: CodexManagedAccount,
    managedAuthContents: string
  ): boolean {
    const identity = this.readIdentityFromAuthContents(runtimeAuthContents)
    if (!identity) {
      return false
    }
    const managedIdentity = this.readIdentityFromAuthContents(managedAuthContents)

    // Why: old live Codex PTYs can still write refreshed tokens into the
    // shared runtime home after the user switches accounts. Never persist
    // that write into the newly active managed account unless the auth claims
    // still match the account Yiru believes is selected.
    const selectedEmail = this.firstNonNull(
      this.normalizeField(activeAccount.email),
      managedIdentity?.email
    )
    const selectedProviderId = this.firstNonNull(
      this.normalizeField(activeAccount.providerAccountId),
      managedIdentity?.providerAccountId
    )
    const selectedWorkspaceId = this.firstNonNull(
      this.normalizeField(activeAccount.workspaceAccountId),
      managedIdentity?.workspaceAccountId
    )
    const emailMatches = Boolean(
      selectedEmail && identity.email && selectedEmail === identity.email
    )
    if (selectedEmail && identity.email && selectedEmail !== identity.email) {
      return false
    }
    if (!this.identityFieldMatches(selectedProviderId, identity.providerAccountId)) {
      return false
    }
    if (!this.identityFieldMatches(selectedWorkspaceId, identity.workspaceAccountId)) {
      return false
    }

    const hasStrongIdentity = Boolean(
      (selectedProviderId && identity.providerAccountId) ||
      (selectedWorkspaceId && identity.workspaceAccountId)
    )
    return (
      hasStrongIdentity ||
      (emailMatches && !identity.providerAccountId && !identity.workspaceAccountId)
    )
  }
}
