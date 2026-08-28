import { RateLimitAccountRefresh } from './service-account-refresh'

export abstract class RateLimitInactiveAccounts extends RateLimitAccountRefresh {
  evictInactiveClaudeCache(accountId: string): void {
    this.inactiveClaudeAccountsGeneration += 1
    this.inactiveClaudeCache.delete(accountId)
    this.inactiveClaudeFetching.delete(accountId)
    this.notifyStateListeners()
  }

  protected isCurrentInactiveClaudeAccount(accountId: string): boolean {
    return (this.inactiveClaudeAccountsResolver?.() ?? []).some(
      (account) => account.id === accountId
    )
  }

  protected isCurrentInactiveCodexAccount(accountId: string): boolean {
    return (this.inactiveCodexAccountsResolver?.() ?? []).some(
      (account) => account.id === accountId
    )
  }

  protected pruneInactiveClaudeState(): void {
    const currentIds = new Set(
      (this.inactiveClaudeAccountsResolver?.() ?? []).map((account) => account.id)
    )
    for (const accountId of this.inactiveClaudeCache.keys()) {
      if (!currentIds.has(accountId)) {
        this.inactiveClaudeCache.delete(accountId)
      }
    }
    for (const accountId of this.inactiveClaudeFetching) {
      if (!currentIds.has(accountId)) {
        this.inactiveClaudeFetching.delete(accountId)
      }
    }
  }

  protected pruneInactiveCodexState(): void {
    const currentIds = new Set(
      (this.inactiveCodexAccountsResolver?.() ?? []).map((account) => account.id)
    )
    for (const accountId of this.inactiveCodexCache.keys()) {
      if (!currentIds.has(accountId)) {
        this.inactiveCodexCache.delete(accountId)
      }
    }
    for (const accountId of this.inactiveCodexFetching) {
      if (!currentIds.has(accountId)) {
        this.inactiveCodexFetching.delete(accountId)
      }
    }
  }

  evictInactiveCodexCache(accountId: string): void {
    // Why: only the evicted account's state should be cleared. The per-account
    // isCurrentInactiveCodexAccount guard in fetchInactiveCodexAccountsOnOpen
    // already catches a removed account when its resolver entry disappears,
    // so bumping the generation here would also invalidate sibling fetches
    // still in flight and discard their fresh results.
    this.inactiveCodexCache.delete(accountId)
    this.inactiveCodexFetching.delete(accountId)
    this.notifyStateListeners()
  }
}
