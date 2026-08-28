import type {
  InactiveAccountUsage,
  ProviderRateLimits
} from '@yiru/runtime-protocol/workbench/rate-limit-types'

import { fetchClaudeRateLimits } from './claude-fetcher'
import { fetchCodexRateLimits } from './codex-fetcher'
import { readGrokAuthSession } from './grok-auth'
import { fetchGrokRateLimits } from './grok-fetcher'
import { RateLimitFetchAllCycle } from './service-fetch-all-cycle'
import { STALE_THRESHOLD_MS, type InternalRateLimitState } from './service-foundation'

export class RateLimitService extends RateLimitFetchAllCycle {
  protected async runFetchCodexOnlyCycle(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return
    }
    const codexTarget = this.codexFetchTarget
    const codexHomePath = this.codexHomePathResolver?.(codexTarget) ?? null
    const codexProvenance = this.getCodexProvenance(codexTarget, codexHomePath)
    const codexGeneration = this.codexFetchGeneration
    const previousState = this.state

    this.updateState({
      ...previousState,
      codex: this.withFetchingStatus(previousState.codex, 'codex')
    })

    const missingWslCodexHome = codexHomePath
      ? null
      : this.getMissingWslCodexHomeResult(codexTarget)
    const codex = await (
      missingWslCodexHome
        ? Promise.resolve(missingWslCodexHome)
        : fetchCodexRateLimits({
            codexHomePath,
            signal
          })
    ).catch((err): ProviderRateLimits => ({
      provider: 'codex',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: err instanceof Error ? err.message : 'Unknown error',
      status: 'error'
    }))

    if (signal.aborted) {
      return
    }

    const latestCodexHomePath = this.codexHomePathResolver?.(codexTarget) ?? null
    const latestCodexProvenance = this.getCodexProvenance(codexTarget, latestCodexHomePath)
    const shouldApplyCodex =
      codexGeneration === this.codexFetchGeneration && codexProvenance === latestCodexProvenance

    if (shouldApplyCodex) {
      this.trackActiveFailureStreak('codex', codex)
    }
    this.updateState({
      ...this.state,
      codex: shouldApplyCodex ? this.applyStalePolicy(codex, previousState.codex) : this.state.codex
    })
  }

  protected async runFetchClaudeOnlyCycle(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return
    }
    const claudeTarget = this.claudeFetchTarget
    const claudeAuthPreparation = await this.claudeAuthPreparationResolver?.(claudeTarget)
    if (signal.aborted) {
      return
    }
    const claudeProvenance = claudeAuthPreparation?.provenance ?? 'system'
    const claudeGeneration = this.claudeFetchGeneration
    const previousState = this.state

    this.updateState({
      ...previousState,
      claude: this.withFetchingStatus(previousState.claude, 'claude')
    })

    const claude = await fetchClaudeRateLimits({
      authPreparation: claudeAuthPreparation,
      allowPtyFallback: this.shouldAllowClaudePtyFallback(claudeAuthPreparation),
      allowUsagePanelSupplement: this.shouldAllowClaudeUsagePanelSupplement(),
      networkProxySettings: this.networkProxySettingsResolver?.(),
      signal
    }).catch((err): ProviderRateLimits => ({
      provider: 'claude',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: err instanceof Error ? err.message : 'Unknown error',
      status: 'error'
    }))

    if (signal.aborted) {
      return
    }

    const latestClaudeAuthPreparation = await this.claudeAuthPreparationResolver?.(claudeTarget)
    if (signal.aborted) {
      return
    }
    const latestClaudeProvenance = latestClaudeAuthPreparation?.provenance ?? 'system'
    const shouldApplyClaude =
      claudeGeneration === this.claudeFetchGeneration &&
      claudeProvenance === latestClaudeProvenance &&
      this.isSameClaudeTarget(claudeTarget, this.claudeFetchTarget)

    if (shouldApplyClaude) {
      this.trackActiveFailureStreak('claude', claude)
    }
    this.updateState({
      ...this.state,
      claude: shouldApplyClaude
        ? this.applyStalePolicy(claude, previousState.claude)
        : this.state.claude
    })
  }

  protected async runFetchGrokOnlyCycle(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return
    }
    const previousState = this.state
    const grokAuthReadResult = readGrokAuthSession()
    this.grokAuthConfigured = grokAuthReadResult.status === 'ok'

    this.updateState({
      ...previousState,
      grok: this.withFetchingStatus(previousState.grok, 'grok')
    })

    const grok = await fetchGrokRateLimits({
      signal,
      authReadResult: grokAuthReadResult
    }).catch((err): ProviderRateLimits => ({
      provider: 'grok',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: err instanceof Error ? err.message : 'Unknown error',
      status: 'error'
    }))

    if (signal.aborted) {
      return
    }

    this.trackActiveFailureStreak('grok', grok)
    this.updateState({
      ...this.state,
      grok: this.applyStalePolicy(grok, previousState.grok)
    })
  }

  protected applyStalePolicy(
    fresh: ProviderRateLimits,
    previous: ProviderRateLimits | null
  ): ProviderRateLimits {
    // Fresh data is fine — use it
    if (fresh.status === 'ok') {
      return {
        ...fresh,
        usageMetadata: {
          ...fresh.usageMetadata,
          lastSuccessfulSource:
            fresh.usageMetadata?.source ?? fresh.usageMetadata?.lastSuccessfulSource
        }
      }
    }

    // Explicitly unavailable — user likely cleared a setting. Discard any stale
    // data so the UI reflects that the provider is now disabled/unconfigured.
    if (fresh.status === 'unavailable') {
      return fresh
    }

    const previousHasData = Boolean(
      previous?.session ||
      previous?.weekly ||
      previous?.fableWeekly ||
      previous?.monthly ||
      (previous?.buckets && previous.buckets.length > 0)
    )

    // No previous data to fall back on
    if (!previous || !previousHasData) {
      return fresh
    }

    // Previous data is too old — don't show stale data
    if (Date.now() - previous.updatedAt > STALE_THRESHOLD_MS) {
      return fresh
    }

    // Why: once we have a recent successful snapshot, repeated transient
    // failures should keep showing that same snapshot until it ages out of the
    // stale window. Otherwise the bar flaps from "stale but useful" to empty
    // after the second failure even though the last known quota is still fresh
    // enough to be actionable.
    return {
      ...previous,
      error: fresh.error,
      status: 'error',
      usageMetadata: {
        ...previous.usageMetadata,
        ...fresh.usageMetadata,
        lastSuccessfulSource:
          previous.usageMetadata?.lastSuccessfulSource ?? previous.usageMetadata?.source
      }
    }
  }

  protected buildInactiveArray(
    cache: Map<string, ProviderRateLimits>,
    fetching: Set<string>
  ): InactiveAccountUsage[] {
    const result: InactiveAccountUsage[] = []
    for (const [accountId, limits] of cache) {
      result.push({
        accountId,
        rateLimits: limits,
        updatedAt: limits.updatedAt,
        isFetching: fetching.has(accountId)
      })
    }
    // Why: include accounts that are fetching but have no cache yet so the
    // renderer can show a loading indicator for newly added accounts.
    for (const accountId of fetching) {
      if (!cache.has(accountId)) {
        result.push({
          accountId,
          rateLimits: null,
          updatedAt: 0,
          isFetching: true
        })
      }
    }
    return result
  }

  protected updateState(next: InternalRateLimitState): void {
    this.state = next
    this.notifyStateListeners()
  }

  protected notifyStateListeners(): void {
    const state = this.getState()
    for (const listener of this.stateListeners) {
      try {
        listener(state)
      } catch {
        // ignore — one bad listener must not break the others
      }
    }
  }
}
