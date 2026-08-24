import type { Store } from '~main/persistence'
import type { RateLimitService } from '~main/rate-limits/service'
import type {
  ClaudeManagedAccount,
  ClaudeManagedAccountSummary,
  ClaudeRateLimitAccountsState
} from '~shared/types'

import { beginClaudeAuthSwitch, endClaudeAuthSwitch } from './live-pty-gate'
import type { ClaudeRuntimeAuthService } from './runtime-auth-service'
import {
  normalizeClaudeRuntimeSelection,
  pruneInvalidClaudeRuntimeSelection,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'

export class ClaudeAccountState {
  private readonly store: Store
  private readonly rateLimits: RateLimitService
  private readonly runtimeAuth: ClaudeRuntimeAuthService

  constructor(store: Store, rateLimits: RateLimitService, runtimeAuth: ClaudeRuntimeAuthService) {
    this.store = store
    this.rateLimits = rateLimits
    this.runtimeAuth = runtimeAuth
  }

  settings(): ReturnType<Store['getSettings']> {
    return this.store.getSettings()
  }

  updateSettings(settings: Parameters<Store['updateSettings']>[0]): void {
    this.store.updateSettings(settings)
  }

  snapshot(): ClaudeRateLimitAccountsState {
    const settings = this.store.getSettings()
    return {
      accounts: settings.claudeManagedAccounts
        .map(toSummary)
        .sort((left, right) => right.updatedAt - left.updatedAt),
      activeAccountId: normalizeClaudeRuntimeSelection(settings).host,
      activeAccountIdsByRuntime: normalizeClaudeRuntimeSelection(settings)
    }
  }

  requireAccount(accountId: string): ClaudeManagedAccount {
    const account = this.store
      .getSettings()
      .claudeManagedAccounts.find((entry) => entry.id === accountId)
    if (!account) {
      throw new Error('That Claude account no longer exists.')
    }
    return account
  }

  normalizeSelection(): void {
    const settings = this.store.getSettings()
    const current = normalizeClaudeRuntimeSelection(settings)
    const next = pruneInvalidClaudeRuntimeSelection(current, settings.claudeManagedAccounts)
    if (
      next.host !== settings.activeClaudeManagedAccountId ||
      JSON.stringify(next) !== JSON.stringify(current)
    ) {
      this.store.updateSettings({
        activeClaudeManagedAccountId: next.host,
        activeClaudeManagedAccountIdsByRuntime: next
      })
    }
  }

  restoreSettings(settings: ReturnType<Store['getSettings']>): void {
    this.store.updateSettings({
      claudeManagedAccounts: settings.claudeManagedAccounts,
      activeClaudeManagedAccountId: settings.activeClaudeManagedAccountId,
      activeClaudeManagedAccountIdsByRuntime: settings.activeClaudeManagedAccountIdsByRuntime
    })
  }

  async syncRuntime(target?: ClaudeAccountSelectionTarget): Promise<void> {
    beginClaudeAuthSwitch()
    try {
      await this.runtimeAuth.syncForCurrentSelection(target)
    } finally {
      endClaudeAuthSwitch()
    }
  }

  forceRollback(): Promise<void> {
    return this.runtimeAuth.forceMaterializeCurrentSelectionForRollback()
  }

  clearLastWrittenCredentials(accountId: string): void {
    this.runtimeAuth.clearLastWrittenCredentialsJson(accountId)
  }

  evictRateLimitCache(accountId: string): void {
    this.rateLimits.evictInactiveClaudeCache(accountId)
  }

  refreshRateLimits(
    outgoingAccountId: string | null | undefined,
    target?: ClaudeAccountSelectionTarget
  ): Promise<unknown> {
    return this.rateLimits.refreshForClaudeAccountChange(outgoingAccountId, target)
  }
}

function toSummary(account: ClaudeManagedAccount): ClaudeManagedAccountSummary {
  return {
    id: account.id,
    email: account.email,
    managedAuthRuntime: account.managedAuthRuntime ?? 'host',
    wslDistro: account.wslDistro ?? null,
    authMethod: account.authMethod ?? 'unknown',
    organizationUuid: account.organizationUuid ?? null,
    organizationName: account.organizationName ?? null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastAuthenticatedAt: account.lastAuthenticatedAt
  }
}
