import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { MANAGED_HOOK_TIMEOUT_SECONDS } from '~main/agent-hooks/managed-hook-commands'
import type { Store } from '~main/persistence'
import { toWindowsWslPath } from '~main/wsl'

import { syncSystemConfigIntoManagedCodexHome } from '../config-mirror'
import { rewriteRelativePathConfigValues } from '../config-path-reference-rewrite'
import { getSystemCodexHomePath } from '../home-paths'
import { getCodexManagedHookInstallMaterial } from '../hook-service'
import { stripCodexManagedHookTrustEntriesFromConfig } from '../managed-trust-reconciliation'
import { readCodexTopLevelModelProvider } from '../model-provider-config'
import { isCodexSystemDefaultRealHomeEnabled } from '../real-home-flag'
import { writeFileAtomically } from './atomic-file-operations'
import type { CodexManagedHome } from './managed-home'

type CanonicalCodexConfig = {
  contents: string
  sourceHomePath: string
  sourceHooksPath: string
}

export class CodexManagedConfig {
  private readonly store: Store
  private readonly homes: CodexManagedHome

  constructor(store: Store, homes: CodexManagedHome) {
    this.store = store
    this.homes = homes
  }

  syncAllSafely(): void {
    try {
      this.syncCanonicalConfigToManagedHomes()
    } catch (error) {
      console.warn('[codex-accounts] Failed to sync canonical config:', error)
    }
  }

  syncIntoSafely(
    managedHomePath: string,
    expectedAccountId?: string,
    canonicalConfig?: CanonicalCodexConfig | null
  ): void {
    try {
      this.syncCanonicalConfigIntoManagedHome(managedHomePath, canonicalConfig, expectedAccountId)
    } catch (error) {
      console.warn('[codex-accounts] Failed to seed managed config:', error)
    }
  }

  private syncCanonicalConfigToManagedHomes(): void {
    const settings = this.store.getSettings()
    for (const account of settings.codexManagedAccounts) {
      try {
        this.syncCanonicalConfigIntoManagedHome(account.managedHomePath, undefined, account.id)
      } catch (error) {
        console.warn('[codex-accounts] Failed to sync managed config:', error)
      }
    }
  }

  private syncCanonicalConfigIntoManagedHome(
    managedHomePath: string,
    canonicalConfig = this.readCanonicalForHome(managedHomePath),
    expectedAccountId?: string
  ): void {
    if (canonicalConfig === null) {
      return
    }

    const trustedManagedHomePath = this.homes.assertPath(managedHomePath, expectedAccountId)
    if (isCodexSystemDefaultRealHomeEnabled() && !parseWslUncPath(trustedManagedHomePath)) {
      // Why: the account home is now the live CODEX_HOME. Merge canonical
      // settings so account-local hook and project trust survives switching.
      syncSystemConfigIntoManagedCodexHome({
        runtimeHomePath: trustedManagedHomePath,
        systemHomePath: getSystemCodexHomePath()
      })
      return
    }
    // Why: Yiru account switching is meant to swap Codex credentials and quota
    // identity, not silently fork the user's sandbox/config defaults. Syncing
    // one canonical config into every managed home keeps auth isolated per
    // account while preserving consistent Codex behavior. Managed homes are
    // real CODEX_HOMEs for `codex login`, so relative path-valued settings
    // must keep resolving against the home the config was read from.
    let sanitizedConfig = canonicalConfig.contents
    if (isCodexSystemDefaultRealHomeEnabled()) {
      const material = getCodexManagedHookInstallMaterial()
      // Why: source-home Yiru trust points at a different hooks.json and must
      // not be copied into the WSL account lane as if it authorized that home.
      sanitizedConfig = stripCodexManagedHookTrustEntriesFromConfig(canonicalConfig.contents, {
        runtimeHomePath: canonicalConfig.sourceHomePath,
        sourcePath: canonicalConfig.sourceHooksPath,
        command: material.command,
        managedEventLabels: new Set(Object.values(material.eventLabel)),
        timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
      })
    }
    this.writeManagedConfig(
      trustedManagedHomePath,
      rewriteRelativePathConfigValues(sanitizedConfig, canonicalConfig.sourceHomePath)
    )
  }

  private readCanonicalConfig(): CanonicalCodexConfig | null {
    const sourceHomePath = join(homedir(), '.codex')
    const primaryConfigPath = join(sourceHomePath, 'config.toml')
    if (!existsSync(primaryConfigPath)) {
      return null
    }

    try {
      return {
        contents: readFileSync(primaryConfigPath, 'utf-8'),
        sourceHomePath,
        sourceHooksPath: join(sourceHomePath, 'hooks.json')
      }
    } catch (error) {
      console.warn('[codex-accounts] Failed to read canonical config:', error)
      return null
    }
  }

  readCanonicalForHome(managedHomePath: string): CanonicalCodexConfig | null {
    const wslInfo = parseWslUncPath(managedHomePath)
    if (!wslInfo) {
      return this.readCanonicalConfig()
    }

    const managedRootMarker = '/.local/share/yiru/codex-accounts/'
    const markerIndex = wslInfo.linuxPath.indexOf(managedRootMarker)
    if (markerIndex < 0) {
      return null
    }
    const wslHome = wslInfo.linuxPath.slice(0, markerIndex)
    const configPath = toWindowsWslPath(`${wslHome}/.codex/config.toml`, wslInfo.distro)
    if (!existsSync(configPath)) {
      return null
    }

    try {
      // Why: the config is read over UNC but consumed by Codex inside WSL, so
      // path rewrites must anchor to the Linux-side ~/.codex, not the UNC path.
      return {
        contents: readFileSync(configPath, 'utf-8'),
        sourceHomePath: `${wslHome}/.codex`,
        sourceHooksPath: `${wslHome}/.codex/hooks.json`
      }
    } catch (error) {
      console.warn('[codex-accounts] Failed to read WSL canonical config:', error)
      return null
    }
  }

  assertOAuthAddAllowed(canonicalConfig: CanonicalCodexConfig | null): void {
    const provider = canonicalConfig
      ? readCodexTopLevelModelProvider(canonicalConfig.contents)
      : null
    if (!provider || provider === 'openai') {
      return
    }
    // Why: copying a custom-provider pin into an OAuth home makes the new
    // account credentials inert while appearing to have signed in normally.
    throw new Error(
      `Yiru cannot add a Codex OAuth account while ~/.codex/config.toml pins the custom provider ${JSON.stringify(provider)}. Keep using the system-default account for this provider, or remove model_provider (or set it to "openai") before adding an OAuth account. Yiru left your config unchanged.`
    )
  }

  private writeManagedConfig(managedHomePath: string, contents: string): void {
    const configPath = join(managedHomePath, 'config.toml')
    try {
      if (existsSync(configPath) && readFileSync(configPath, 'utf-8') === contents) {
        return
      }
    } catch {
      // Why: read errors should not make a stale config look current; the
      // atomic write path owns Windows ACL repair and persistent error surfacing.
    }
    writeFileAtomically(configPath, contents)
  }
}
