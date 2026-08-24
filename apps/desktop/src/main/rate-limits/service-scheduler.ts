import type { ProviderRateLimits } from '~shared/rate-limit-types'

import {
  ACTIVE_FAILURE_REFETCH_MS,
  DEFERRED_STARTUP_ACTIVE_REFRESH_MS,
  INDIVIDUALLY_REFRESHABLE_PROVIDERS,
  MAX_ACTIVE_FAILURE_REFETCH_MS,
  MIN_REFETCH_MS,
  normalizePollingInterval,
  type ActiveRateLimitProvider,
  type ActiveProviderState,
  type ActiveWindowRefreshPlan
} from './service-foundation'
import { RateLimitInactiveAccounts } from './service-inactive-accounts'

export abstract class RateLimitScheduler extends RateLimitInactiveAccounts {
  setPollingInterval(ms: number): void {
    this.pollInterval = normalizePollingInterval(ms)
    if (this.timer) {
      this.stopTimer()
      this.startTimer()
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  protected startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => {
      if (!this.shouldBackgroundPoll()) {
        return
      }
      void this.fetchAll()
    }, this.pollInterval)
  }

  protected stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  protected scheduleDeferredStartupRefresh(): void {
    this.clearDeferredStartupRefresh()
    this.deferredStartupRefreshTimer = setTimeout(() => {
      this.deferredStartupRefreshTimer = null
      void this.refreshIfWindowActive()
    }, DEFERRED_STARTUP_ACTIVE_REFRESH_MS)
  }

  protected clearDeferredStartupRefresh(): void {
    if (this.deferredStartupRefreshTimer) {
      clearTimeout(this.deferredStartupRefreshTimer)
      this.deferredStartupRefreshTimer = null
    }
  }

  protected shouldBackgroundPoll(): boolean {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return false
    }
    // Why: these quota fetches only power in-app UI. When Yiru is hidden,
    // minimized, or unfocused, polling only burns CLI/API budget without any
    // visible benefit. We refresh again as soon as the window becomes active.
    if (!this.mainWindow.isVisible() || this.mainWindow.isMinimized()) {
      return false
    }
    return this.mainWindow.isFocused()
  }

  protected getActiveProviderState(): ActiveProviderState[] {
    // Why: key by provider so a newly added provider is compile-forced to have
    // an active-refresh entry — a missing one silently never recovers from a
    // startup error (antigravity was omitted once and needed a fix-up).
    const byProvider: Record<ActiveRateLimitProvider, ProviderRateLimits | null> = {
      claude: this.state.claude,
      codex: this.state.codex,
      cursor: this.state.cursor,
      gemini: this.state.gemini,
      'opencode-go': this.state.opencodeGo,
      kimi: this.state.kimi,
      minimax: this.state.minimax,
      grok: this.state.grok,
      antigravity: this.state.antigravity
    }
    return Object.entries(byProvider).map(([provider, limits]) => ({
      provider: provider as ActiveRateLimitProvider,
      limits
    }))
  }

  protected getActiveWindowRefreshPlan(now: number): ActiveWindowRefreshPlan {
    const retryableFailures: ActiveRateLimitProvider[] = []
    for (const { provider, limits } of this.getActiveProviderState()) {
      if (!limits || limits.status === 'idle' || limits.status === 'fetching') {
        return { kind: 'full' }
      }
      if (limits.status === 'ok' || limits.status === 'unavailable') {
        if (now - limits.updatedAt >= MIN_REFETCH_MS) {
          return { kind: 'full' }
        }
        continue
      }
      // Why: a failed startup read is not fresh data. Keep it eligible for
      // activation recovery while throttling repeated events per provider.
      if (limits.status === 'error') {
        const lastRetryAt = this.lastActiveFailureRetryAtByProvider[provider]
        const throttleMs = INDIVIDUALLY_REFRESHABLE_PROVIDERS.has(provider)
          ? Math.min(
              ACTIVE_FAILURE_REFETCH_MS *
                2 ** Math.max(0, this.activeFailureStreakByProvider[provider] - 1),
              MAX_ACTIVE_FAILURE_REFETCH_MS
            )
          : MIN_REFETCH_MS
        if (now - lastRetryAt >= throttleMs) {
          retryableFailures.push(provider)
        }
      }
    }

    if (retryableFailures.length === 0) {
      return { kind: 'none' }
    }
    return { kind: 'providers', providers: retryableFailures }
  }

  protected async runActiveWindowRefreshPlan(plan: ActiveWindowRefreshPlan): Promise<void> {
    if (plan.kind === 'none') {
      return
    }
    if (plan.kind === 'full') {
      // Why: a full fetch retries failing providers too. Restart their retry
      // clocks so the individual failure lane doesn't fire again right after,
      // ahead of its backoff window. Skip when a fetch is already in flight —
      // fetchAll would no-op and the throttle must not be consumed for free.
      if (!this.isFetching) {
        const now = Date.now()
        for (const { provider, limits } of this.getActiveProviderState()) {
          if (limits?.status === 'error') {
            this.lastActiveFailureRetryAtByProvider[provider] = now
          }
        }
      }
      await this.fetchAll()
      return
    }

    // Why: a fetch already in flight will refresh these providers; skip without
    // consuming the per-provider retry throttle so the next activation retries.
    if (this.isFetching) {
      return
    }

    const now = Date.now()
    for (const provider of plan.providers) {
      this.lastActiveFailureRetryAtByProvider[provider] = now
    }

    const canRefreshIndividually = plan.providers.every((provider) =>
      INDIVIDUALLY_REFRESHABLE_PROVIDERS.has(provider)
    )
    if (!canRefreshIndividually) {
      await this.fetchAll()
      return
    }

    // Why: partial failures of providers with a dedicated fetch cycle should
    // recover without re-reading healthy providers still inside their debounce.
    if (plan.providers.includes('claude')) {
      await this.fetchClaudeOnly()
    }
    if (plan.providers.includes('codex')) {
      await this.fetchCodexOnly()
    }
    if (plan.providers.includes('grok')) {
      await this.fetchGrokOnly()
    }
  }

  protected async refreshIfWindowActive(): Promise<void> {
    if (!this.shouldBackgroundPoll()) {
      return
    }
    const plan = this.getActiveWindowRefreshPlan(Date.now())
    await this.runActiveWindowRefreshPlan(plan)
  }
}
