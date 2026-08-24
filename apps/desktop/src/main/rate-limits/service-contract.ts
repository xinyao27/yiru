import type { InactiveAccountUsage, ProviderRateLimits } from '~shared/rate-limit-types'

import type { NormalizedClaudeAccountSelectionTarget } from '../claude/accounts/runtime-selection'
import type { NormalizedCodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import type {
  ActiveRateLimitProvider,
  ActiveWindowRefreshPlan,
  InternalRateLimitState
} from './service-foundation'

export abstract class RateLimitServiceContract {
  protected abstract startTimer(): void
  protected abstract stopTimer(): void
  protected abstract scheduleDeferredStartupRefresh(): void
  protected abstract clearDeferredStartupRefresh(): void
  protected abstract refreshIfWindowActive(): Promise<void>
  protected abstract fetchAll(options?: { force?: boolean }): Promise<void>
  protected abstract fetchCodexOnly(options?: { force?: boolean }): Promise<void>
  protected abstract fetchClaudeOnly(options?: { force?: boolean }): Promise<void>
  protected abstract fetchGrokOnly(options?: { force?: boolean }): Promise<void>
  protected abstract waitForFetchIdle(): Promise<void>
  protected abstract abortActiveFetchCycle(): void
  protected abstract clearQueuedFetches(): void
  protected abstract resolveAndClearFetchIdleWaiters(): void
  protected abstract getActiveWindowRefreshPlan(now: number): ActiveWindowRefreshPlan
  protected abstract runActiveWindowRefreshPlan(plan: ActiveWindowRefreshPlan): Promise<void>
  protected abstract pruneInactiveClaudeState(): void
  protected abstract pruneInactiveCodexState(): void
  protected abstract buildInactiveArray(
    cache: Map<string, ProviderRateLimits>,
    fetching: Set<string>
  ): InactiveAccountUsage[]
  protected abstract withFetchingStatus(
    current: ProviderRateLimits | null,
    provider: ActiveRateLimitProvider
  ): ProviderRateLimits
  protected abstract updateState(next: InternalRateLimitState): void
  protected abstract notifyStateListeners(): void
  protected abstract beginFetchCycle(): AbortController
  protected abstract finishFetchCycle(controller: AbortController): void
  protected abstract isSameCodexTarget(
    left: NormalizedCodexAccountSelectionTarget,
    right: NormalizedCodexAccountSelectionTarget
  ): boolean
  protected abstract isSameClaudeTarget(
    left: NormalizedClaudeAccountSelectionTarget,
    right: NormalizedClaudeAccountSelectionTarget
  ): boolean
  protected abstract getMissingWslCodexHomeResult(
    target: NormalizedCodexAccountSelectionTarget
  ): ProviderRateLimits | null
  protected abstract shouldAllowClaudeUsagePanelSupplement(): boolean
  protected abstract isCurrentInactiveClaudeAccount(accountId: string): boolean
  protected abstract isCurrentInactiveCodexAccount(accountId: string): boolean
  protected abstract applyStalePolicy(
    fresh: ProviderRateLimits,
    previous: ProviderRateLimits | null
  ): ProviderRateLimits
}
