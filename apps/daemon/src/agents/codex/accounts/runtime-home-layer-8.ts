import { existsSync, readFileSync } from 'node:fs'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import type { CodexManagedAccount } from '@yiru/runtime-protocol/workbench/types'

import { writeFileAtomically } from './atomic-file-operations'
import type { CodexReadBackResult } from './runtime-home-foundation'
import { CodexRuntimeHomeLayer7 } from './runtime-home-layer-7'
import {
  getSelectedCodexAccountIdForTarget,
  normalizeCodexRuntimeSelection,
  type CodexAccountSelectionTarget
} from './runtime-selection'

export abstract class CodexRuntimeHomeLayer8 extends CodexRuntimeHomeLayer7 {
  clearLastWrittenAuthJson(
    accountId = normalizeCodexRuntimeSelection(this.store.getSettings()).host
  ): void {
    if (accountId === normalizeCodexRuntimeSelection(this.store.getSettings()).host) {
      this.lastWrittenAuthJson = null
    }
    this.skipNextReadBackForAccountId = accountId
  }

  protected readBackRefreshedTokens(options: {
    updateLastWrittenAuthJson: boolean
  }): CodexReadBackResult {
    const selectedAccountId = normalizeCodexRuntimeSelection(this.store.getSettings()).host
    if (selectedAccountId) {
      const selectedAccountResult = this.readBackRefreshedTokensFromPath(
        this.getRuntimeAuthPath(),
        {
          ...options,
          expectedAccountId: selectedAccountId
        }
      )
      if (selectedAccountResult !== 'rejected') {
        return selectedAccountResult
      }
    }

    return this.readBackRefreshedTokensFromPath(this.getRuntimeAuthPath(), options)
  }

  protected readBackRefreshedTokensFromPath(
    runtimeAuthPath: string,
    options: {
      updateLastWrittenAuthJson: boolean
      lastWrittenAuthJson?: string | null
      setLastWrittenAuthJson?: (contents: string) => void
      expectedAccountId?: string
    }
  ): CodexReadBackResult {
    try {
      if (!existsSync(runtimeAuthPath)) {
        return 'unchanged'
      }

      const lastWrittenAuthJson =
        options.lastWrittenAuthJson === undefined
          ? this.lastWrittenAuthJson
          : options.lastWrittenAuthJson
      const runtimeContents = readFileSync(runtimeAuthPath, 'utf-8')
      if (lastWrittenAuthJson !== null && runtimeContents === lastWrittenAuthJson) {
        return 'unchanged'
      }

      const match = this.findManagedAccountForRuntimeAuth(
        runtimeContents,
        options.expectedAccountId
      )
      if (match.kind !== 'matched') {
        if (match.kind === 'ambiguous') {
          console.warn('[codex-runtime-home] Refusing ambiguous Codex auth read-back')
        }
        return 'rejected'
      }
      // Why: after app restart, Yiru has no last-written baseline. Identity
      // alone cannot prove runtime auth is newer than managed storage.
      if (
        lastWrittenAuthJson === null &&
        !this.runtimeAuthIsFresher(runtimeContents, match.managedAuthContents)
      ) {
        return 'rejected'
      }

      writeFileAtomically(match.managedAuthPath, runtimeContents, { mode: 0o600 })
      if (options.updateLastWrittenAuthJson) {
        if (options.setLastWrittenAuthJson) {
          options.setLastWrittenAuthJson(runtimeContents)
        } else {
          this.lastWrittenAuthJson = runtimeContents
        }
      }
      return 'persisted'
    } catch (error) {
      // Why: read-back is best-effort. A transient fs error must not block the
      // forward sync path — the worst case is one more stale-token cycle, which
      // is strictly better than failing the entire sync.
      console.warn('[codex-runtime-home] Failed to read back refreshed tokens:', error)
      return 'rejected'
    }
  }

  protected readBackRefreshedTokensForAccount(
    account: CodexManagedAccount,
    options: { updateLastWrittenAuthJson: boolean }
  ): CodexReadBackResult {
    return this.readBackRefreshedTokensFromPath(this.getRuntimeAuthPath(), {
      ...options,
      expectedAccountId: account.id
    })
  }

  protected safeSyncForCurrentSelection(): void {
    try {
      this.syncForCurrentSelection()
    } catch (error) {
      console.warn('[codex-runtime-home] Failed to sync runtime auth state:', error)
    }
  }

  protected getActiveAccount(
    accounts: CodexManagedAccount[],
    activeAccountId: string | null
  ): CodexManagedAccount | null {
    if (!activeAccountId) {
      return null
    }
    return accounts.find((account) => account.id === activeAccountId) ?? null
  }

  protected getWslManagedHomePath(account: CodexManagedAccount | null): string | null {
    if (!account) {
      return null
    }
    if (account.managedHomeRuntime === 'wsl' && parseWslUncPath(account.managedHomePath)) {
      return account.managedHomePath
    }
    return parseWslUncPath(account.managedHomePath) ? account.managedHomePath : null
  }

  protected getPreparedWslRateLimitHomePath(target: CodexAccountSelectionTarget): string | null {
    const distro = target.wslDistro?.trim()
    if (distro) {
      const settings = this.store.getSettings()
      const selectedAccountId = getSelectedCodexAccountIdForTarget(settings, target)
      if (selectedAccountId === null) {
        // Why: the system-default account changes outside Yiru (login, logout,
        // token refresh). Read its real home directly so a cached runtime copy
        // cannot stay stale; filesystem probing in the fetcher is asynchronous.
        return this.getWslSystemCodexHomePath(target)
      }
      const cachedRuntimeHomePath = this.wslRuntimeHomePathByDistro.get(distro)
      if (
        cachedRuntimeHomePath &&
        this.lastSyncedWslAccountIdByDistro.has(distro) &&
        this.lastSyncedWslAccountIdByDistro.get(distro) === selectedAccountId
      ) {
        // Why: RateLimitService resolves provenance twice per poll. Account
        // changes sync explicitly, so repeated resolution must stay path-only
        // instead of blocking main on UNC reads and a wsl.exe migration probe.
        return cachedRuntimeHomePath
      }
    }
    return this.syncWslRuntimeForCurrentSelection(target)
  }
}
