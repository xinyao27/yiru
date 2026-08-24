import { randomUUID } from 'node:crypto'

import type { CodexRateLimitResetResult, RateLimitState } from '~shared/rate-limit-types'

import {
  normalizeClaudeAccountSelectionTarget,
  type ClaudeAccountSelectionTarget
} from '../claude/accounts/runtime-selection'
import {
  normalizeCodexAccountSelectionTarget,
  type CodexAccountSelectionTarget
} from '../codex/accounts/runtime-selection'
import { fetchManagedAccountUsage } from './claude-fetcher'
import { consumeCodexRateLimitResetCredit, fetchCodexRateLimits } from './codex-fetcher'
import { RateLimitServiceBase } from './service-base'
import { INACTIVE_FETCH_DEBOUNCE_MS } from './service-foundation'

export abstract class RateLimitAccountRefresh extends RateLimitServiceBase {
  async refreshForCodexAccountChange(
    outgoingAccountId?: string | null,
    target?: CodexAccountSelectionTarget
  ): Promise<RateLimitState> {
    const nextTarget = normalizeCodexAccountSelectionTarget(target)
    if (
      outgoingAccountId &&
      this.state.codex?.session &&
      this.isSameCodexTarget(this.codexFetchTarget, nextTarget)
    ) {
      this.inactiveCodexCache.set(outgoingAccountId, this.state.codex)
    }
    this.codexFetchTarget = nextTarget
    this.codexFetchGeneration += 1
    // Why: a new account/target starts with a clean retry schedule.
    this.activeFailureStreakByProvider.codex = 0
    this.inactiveCodexAccountsGeneration += 1
    this.pruneInactiveCodexState()
    this.lastInactiveCodexFetchAt = 0
    // Why: switching the selected Codex account must immediately clear the old
    // Codex quota view. Keeping stale values visible would show the previous
    // account's limits under the newly selected identity until the next poll.
    this.updateState({
      ...this.state,
      codex: this.withFetchingStatus(null, 'codex')
    })
    await this.fetchCodexOnly({ force: true })
    return this.getState()
  }

  async refreshCodexForTarget(target?: CodexAccountSelectionTarget): Promise<RateLimitState> {
    const nextTarget = normalizeCodexAccountSelectionTarget(target)
    const targetChanged = !this.isSameCodexTarget(this.codexFetchTarget, nextTarget)
    this.codexFetchTarget = nextTarget
    this.codexFetchGeneration += 1
    this.activeFailureStreakByProvider.codex = 0
    this.updateState({
      ...this.state,
      codex: this.withFetchingStatus(targetChanged ? null : this.state.codex, 'codex')
    })
    await this.fetchCodexOnly({ force: true })
    return this.getState()
  }

  async consumeCodexRateLimitResetCredit(): Promise<CodexRateLimitResetResult> {
    const codexTarget = this.codexFetchTarget
    const codexHomePath = this.codexHomePathResolver?.(codexTarget) ?? null
    const missingWslCodexHome = codexHomePath
      ? null
      : this.getMissingWslCodexHomeResult(codexTarget)
    if (missingWslCodexHome) {
      await this.fetchCodexOnly({ force: true })
      throw new Error(missingWslCodexHome.error ?? 'Codex home unavailable')
    }
    try {
      const outcome = await consumeCodexRateLimitResetCredit({
        codexHomePath,
        idempotencyKey: randomUUID()
      })
      await this.fetchCodexOnly({ force: true })
      return { outcome, state: this.getState() }
    } catch (error) {
      await this.fetchCodexOnly({ force: true })
      throw error
    }
  }

  async refreshForClaudeAccountChange(
    outgoingAccountId?: string | null,
    target?: ClaudeAccountSelectionTarget
  ): Promise<RateLimitState> {
    const nextTarget = normalizeClaudeAccountSelectionTarget(target)
    // Why: snapshot the outgoing account's usage before clearing it so the
    // inline usage bars in the switcher can show last-known data immediately.
    if (
      outgoingAccountId &&
      this.state.claude?.session &&
      this.isSameClaudeTarget(this.claudeFetchTarget, nextTarget)
    ) {
      this.inactiveClaudeCache.set(outgoingAccountId, this.state.claude)
    }
    this.claudeFetchTarget = nextTarget
    this.inactiveClaudeAccountsGeneration += 1
    this.pruneInactiveClaudeState()
    this.claudeFetchGeneration += 1
    // Why: a new account/target starts with a clean retry schedule.
    this.activeFailureStreakByProvider.claude = 0
    this.lastInactiveClaudeFetchAt = 0
    this.updateState({
      ...this.state,
      claude: this.withFetchingStatus(null, 'claude')
    })
    await this.fetchClaudeOnly({ force: true })
    return this.getState()
  }

  async refreshClaudeForTarget(target?: ClaudeAccountSelectionTarget): Promise<RateLimitState> {
    const nextTarget = normalizeClaudeAccountSelectionTarget(target)
    const targetChanged = !this.isSameClaudeTarget(this.claudeFetchTarget, nextTarget)
    this.claudeFetchTarget = nextTarget
    this.claudeFetchGeneration += 1
    this.activeFailureStreakByProvider.claude = 0
    this.updateState({
      ...this.state,
      claude: this.withFetchingStatus(targetChanged ? null : this.state.claude, 'claude')
    })
    await this.fetchClaudeOnly({ force: true })
    return this.getState()
  }

  async fetchInactiveClaudeAccountsOnOpen(): Promise<void> {
    if (Date.now() - this.lastInactiveClaudeFetchAt < INACTIVE_FETCH_DEBOUNCE_MS) {
      return
    }
    this.pruneInactiveClaudeState()
    if (this.inactiveClaudeFetching.size > 0) {
      return
    }
    const accounts = this.inactiveClaudeAccountsResolver?.() ?? []
    if (accounts.length === 0) {
      return
    }
    const fetchGeneration = this.inactiveClaudeAccountsGeneration
    const controller = this.beginFetchCycle()
    const signal = controller.signal

    for (const account of accounts) {
      this.inactiveClaudeFetching.add(account.id)
    }
    this.notifyStateListeners()

    try {
      for (const account of accounts) {
        if (
          signal.aborted ||
          fetchGeneration !== this.inactiveClaudeAccountsGeneration ||
          !this.isCurrentInactiveClaudeAccount(account.id)
        ) {
          this.inactiveClaudeFetching.delete(account.id)
          if (!this.isCurrentInactiveClaudeAccount(account.id)) {
            this.inactiveClaudeCache.delete(account.id)
          }
          this.notifyStateListeners()
          continue
        }
        try {
          const fresh = await fetchManagedAccountUsage(account, {
            allowUsagePanelSupplement: this.shouldAllowClaudeUsagePanelSupplement(),
            networkProxySettings: this.networkProxySettingsResolver?.(),
            signal
          })
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveClaudeAccountsGeneration ||
            !this.isCurrentInactiveClaudeAccount(account.id)
          ) {
            this.inactiveClaudeFetching.delete(account.id)
            if (!this.isCurrentInactiveClaudeAccount(account.id)) {
              this.inactiveClaudeCache.delete(account.id)
            }
            this.notifyStateListeners()
            continue
          }
          const cached = this.inactiveClaudeCache.get(account.id) ?? null
          this.inactiveClaudeCache.set(account.id, this.applyStalePolicy(fresh, cached))
        } catch {
          // Why: per-account try/catch prevents one Keychain rejection or
          // network error from aborting the remaining accounts in the batch.
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveClaudeAccountsGeneration ||
            !this.isCurrentInactiveClaudeAccount(account.id)
          ) {
            this.inactiveClaudeCache.delete(account.id)
          }
        }
        this.inactiveClaudeFetching.delete(account.id)
        this.notifyStateListeners()
      }

      if (!signal.aborted && fetchGeneration === this.inactiveClaudeAccountsGeneration) {
        this.lastInactiveClaudeFetchAt = Date.now()
      }
    } finally {
      this.finishFetchCycle(controller)
    }
  }

  async fetchInactiveCodexAccountsOnOpen(): Promise<void> {
    if (Date.now() - this.lastInactiveCodexFetchAt < INACTIVE_FETCH_DEBOUNCE_MS) {
      return
    }
    this.pruneInactiveCodexState()
    if (this.inactiveCodexFetching.size > 0) {
      return
    }
    const accounts = this.inactiveCodexAccountsResolver?.() ?? []
    if (accounts.length === 0) {
      return
    }
    // Why: account switching can make a previewed account active while its
    // RPC-only usage fetch is still in flight; stale results must be ignored.
    const fetchGeneration = this.inactiveCodexAccountsGeneration
    const controller = this.beginFetchCycle()
    const signal = controller.signal

    for (const account of accounts) {
      this.inactiveCodexFetching.add(account.id)
    }
    this.notifyStateListeners()

    try {
      for (const account of accounts) {
        if (
          signal.aborted ||
          fetchGeneration !== this.inactiveCodexAccountsGeneration ||
          !this.isCurrentInactiveCodexAccount(account.id)
        ) {
          this.inactiveCodexFetching.delete(account.id)
          if (!this.isCurrentInactiveCodexAccount(account.id)) {
            this.inactiveCodexCache.delete(account.id)
          }
          this.notifyStateListeners()
          continue
        }
        try {
          // Why: fetchCodexRateLimits already accepts codexHomePath, so we can
          // point it at the managed account's home directory directly without
          // materializing credentials into the shared runtime location.
          const fresh = await fetchCodexRateLimits({
            codexHomePath: account.managedHomePath,
            signal
          })
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveCodexAccountsGeneration ||
            !this.isCurrentInactiveCodexAccount(account.id)
          ) {
            this.inactiveCodexFetching.delete(account.id)
            if (!this.isCurrentInactiveCodexAccount(account.id)) {
              this.inactiveCodexCache.delete(account.id)
            }
            this.notifyStateListeners()
            continue
          }
          const cached = this.inactiveCodexCache.get(account.id) ?? null
          this.inactiveCodexCache.set(account.id, this.applyStalePolicy(fresh, cached))
        } catch {
          // Why: per-account try/catch prevents one failure from aborting the batch.
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveCodexAccountsGeneration ||
            !this.isCurrentInactiveCodexAccount(account.id)
          ) {
            this.inactiveCodexCache.delete(account.id)
          }
        }
        this.inactiveCodexFetching.delete(account.id)
        this.notifyStateListeners()
      }

      if (!signal.aborted && fetchGeneration === this.inactiveCodexAccountsGeneration) {
        this.lastInactiveCodexFetchAt = Date.now()
      }
    } finally {
      this.finishFetchCycle(controller)
    }
  }
}
