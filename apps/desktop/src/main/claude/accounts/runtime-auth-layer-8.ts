import { join } from 'node:path'

import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { getDefaultWslDistro, getWslHome } from '~main/wsl'
import type { ClaudeManagedAccount } from '~shared/types'

import type { ClaudeRuntimeAuthPreparation, ClaudeReadBackMatch } from './runtime-auth-foundation'
import { ClaudeRuntimeAuthLayer7 } from './runtime-auth-layer-7'
import {
  getSelectedClaudeAccountIdForTarget,
  normalizeClaudeAccountSelectionTarget,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'

export abstract class ClaudeRuntimeAuthLayer8 extends ClaudeRuntimeAuthLayer7 {
  protected getPreparation(target?: ClaudeAccountSelectionTarget): ClaudeRuntimeAuthPreparation {
    const settings = this.store.getSettings()
    const paths = this.pathResolver.getRuntimePaths()
    const normalizedTarget = this.resolveWslDefaultTarget(
      target ?? this.getDefaultAccountSelectionTarget(settings)
    )
    const activeAccountId = getSelectedClaudeAccountIdForTarget(settings, normalizedTarget)
    const activeAccount = this.getActiveAccount(settings.claudeManagedAccounts, activeAccountId)
    if (
      normalizeClaudeAccountSelectionTarget(normalizedTarget).runtime === 'wsl' &&
      activeAccount?.managedAuthRuntime === 'wsl' &&
      activeAccount.wslLinuxAuthPath
    ) {
      return {
        configDir: activeAccount.managedAuthPath,
        runtime: 'wsl',
        wslDistro: activeAccount.wslDistro ?? null,
        wslLinuxConfigDir: activeAccount.wslLinuxAuthPath,
        envPatch: { CLAUDE_CONFIG_DIR: activeAccount.wslLinuxAuthPath },
        stripAuthEnv: true,
        provenance: `managed:${activeAccount.id}:wsl:${activeAccount.wslDistro ?? ''}`
      }
    }
    if (normalizeClaudeAccountSelectionTarget(normalizedTarget).runtime === 'wsl') {
      const distro =
        normalizeClaudeAccountSelectionTarget(normalizedTarget).wslDistro ?? getDefaultWslDistro()
      const wslHome = distro ? getWslHome(distro) : null
      const wslHomeInfo = wslHome ? parseWslUncPath(wslHome) : null
      if (distro && wslHome && wslHomeInfo) {
        const windowsConfigDir = join(wslHome, '.claude')
        const linuxConfigDir = `${wslHomeInfo.linuxPath.replace(/\/$/, '')}/.claude`
        return {
          configDir: windowsConfigDir,
          runtime: 'wsl',
          wslDistro: distro,
          wslLinuxConfigDir: linuxConfigDir,
          envPatch: {},
          stripAuthEnv: true,
          provenance: `wsl:${distro}:system`
        }
      }
      return {
        configDir: paths.configDir,
        runtime: 'wsl',
        wslDistro: normalizeClaudeAccountSelectionTarget(normalizedTarget).wslDistro,
        wslLinuxConfigDir: null,
        envPatch: {},
        stripAuthEnv: true,
        provenance: `wsl:${normalizeClaudeAccountSelectionTarget(normalizedTarget).wslDistro ?? '__default__'}:system`
      }
    }
    return {
      configDir: paths.configDir,
      runtime: 'host',
      wslDistro: null,
      wslLinuxConfigDir: null,
      envPatch: paths.envPatch,
      stripAuthEnv: Boolean(activeAccountId && activeAccount?.managedAuthRuntime !== 'wsl'),
      managedRefreshDeferredByLivePty: Boolean(
        activeAccountId &&
        activeAccount?.managedAuthRuntime !== 'wsl' &&
        this.managedRefreshDeferredByLivePtyAccountId === activeAccountId
      ),
      provenance:
        activeAccountId && activeAccount?.managedAuthRuntime !== 'wsl'
          ? `managed:${activeAccountId}`
          : 'system'
    }
  }

  protected getActiveAccount(
    accounts: ClaudeManagedAccount[],
    activeAccountId: string | null
  ): ClaudeManagedAccount | null {
    if (!activeAccountId) {
      return null
    }
    return accounts.find((account) => account.id === activeAccountId) ?? null
  }

  protected getDefaultAccountSelectionTarget(
    settings = this.store.getSettings()
  ): ClaudeAccountSelectionTarget {
    if (process.platform === 'win32' && settings.localAccountRuntime === 'wsl') {
      // Why: account auth defaults follow account runtime settings, not hidden
      // legacy terminal WSL settings that can outlive the Terminal UI control.
      return { runtime: 'wsl', wslDistro: settings.localAccountWslDistro ?? null }
    }
    return { runtime: 'host' }
  }

  protected resolveWslDefaultTarget(
    target?: ClaudeAccountSelectionTarget
  ): ClaudeAccountSelectionTarget {
    if (target?.runtime !== 'wsl' || target.wslDistro?.trim()) {
      return target ?? { runtime: 'host' }
    }
    const defaultDistro = getDefaultWslDistro()
    return defaultDistro ? { runtime: 'wsl', wslDistro: defaultDistro } : target
  }

  protected async findManagedAccountForRuntimeCredentials(
    runtimeCredentialsJson: string,
    runtimeOauthAccount: unknown
  ): Promise<ClaudeReadBackMatch> {
    const matches: { account: ClaudeManagedAccount; managedCredentialsJson: string }[] = []
    let unverifiableCount = 0
    for (const account of this.store.getSettings().claudeManagedAccounts) {
      const managedCredentialsJson = await this.readManagedCredentials(account)
      if (!managedCredentialsJson) {
        continue
      }
      const match = this.runtimeCredentialsMatchAccount(
        runtimeCredentialsJson,
        runtimeOauthAccount,
        account,
        managedCredentialsJson,
        this.readManagedOauthAccount(account)
      )
      if (match === 'match') {
        matches.push({ account, managedCredentialsJson })
      } else if (match === 'unverifiable') {
        unverifiableCount += 1
      }
    }

    if (matches.length === 1 && unverifiableCount === 0) {
      return { kind: 'matched', ...matches[0] }
    }
    return { kind: matches.length === 0 && unverifiableCount === 0 ? 'none' : 'ambiguous' }
  }
}
