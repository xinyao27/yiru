import type {
  CodexManagedAccount,
  CodexManagedAccountSummary,
  CodexRateLimitAccountsState
} from '@yiru/runtime-protocol/workbench/types'
import type { Store } from '~main/persistence/store'
import type { RateLimitService } from '~main/rate-limits/service'

import { CodexAccountIdentity } from './identity'
import type { CodexRuntimeHomeService } from './runtime-home-service'
import {
  normalizeCodexRuntimeSelection,
  pruneInvalidCodexRuntimeSelection,
  type CodexAccountSelectionTarget
} from './runtime-selection'

export class CodexAccountState {
  readonly store: Store
  readonly rateLimits: RateLimitService
  readonly runtimeHome: CodexRuntimeHomeService
  readonly identity = new CodexAccountIdentity()

  constructor(store: Store, rateLimits: RateLimitService, runtimeHome: CodexRuntimeHomeService) {
    this.store = store
    this.rateLimits = rateLimits
    this.runtimeHome = runtimeHome
  }

  startQuotaRefresh(
    outgoingAccountId: string | null | undefined,
    target: CodexAccountSelectionTarget | undefined
  ): void {
    void this.rateLimits.refreshForCodexAccountChange(outgoingAccountId, target).catch((error) => {
      console.error('[codex-accounts] Quota refresh after account change failed:', error)
    })
  }

  snapshot(): CodexRateLimitAccountsState {
    const settings = this.store.getSettings()
    return {
      accounts: settings.codexManagedAccounts
        .map((account) => this.toSummary(account))
        .sort((left, right) => right.updatedAt - left.updatedAt),
      activeAccountId: normalizeCodexRuntimeSelection(settings).host,
      activeAccountIdsByRuntime: normalizeCodexRuntimeSelection(settings),
      systemDefault: this.identity.resolveSystemDefault()
    }
  }

  requireAccount(accountId: string): CodexManagedAccount {
    const account = this.store
      .getSettings()
      .codexManagedAccounts.find((entry) => entry.id === accountId)
    if (!account) {
      throw new Error('That Codex rate limit account no longer exists.')
    }
    return account
  }

  normalizeSelection(): void {
    const settings = this.store.getSettings()
    const selection = normalizeCodexRuntimeSelection(settings)
    const nextSelection = pruneInvalidCodexRuntimeSelection(
      selection,
      settings.codexManagedAccounts
    )
    if (
      nextSelection.host !== selection.host ||
      JSON.stringify(nextSelection.wsl) !== JSON.stringify(selection.wsl)
    ) {
      this.store.updateSettings({
        activeCodexManagedAccountId: nextSelection.host,
        activeCodexManagedAccountIdsByRuntime: nextSelection
      })
    }
  }

  private toSummary(account: CodexManagedAccount): CodexManagedAccountSummary {
    return {
      id: account.id,
      email: account.email,
      managedHomeRuntime: account.managedHomeRuntime ?? 'host',
      wslDistro: account.wslDistro ?? null,
      providerAccountId: account.providerAccountId ?? null,
      workspaceLabel: account.workspaceLabel ?? null,
      workspaceAccountId: account.workspaceAccountId ?? null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      lastAuthenticatedAt: account.lastAuthenticatedAt
    }
  }
}
