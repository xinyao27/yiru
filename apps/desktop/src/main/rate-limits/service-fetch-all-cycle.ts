import type { ProviderRateLimits } from '~shared/rate-limit-types'

import { fetchCursorUsageForRuntime } from '../runtime/cursor-usage/client'
import { fetchClaudeRateLimits } from './claude-fetcher'
import { fetchCodexRateLimits } from './codex-fetcher'
import { fetchGeminiRateLimits } from './gemini-usage-fetcher'
import { readGrokAuthSession } from './grok-auth'
import { fetchGrokRateLimits } from './grok-fetcher'
import { fetchKimiRateLimits } from './kimi-fetcher'
import { fetchMiniMaxRateLimits } from './minimax-fetcher'
import { fetchOpenCodeGoRateLimits } from './opencode-go-usage-fetcher'
import { RateLimitFetchPolicy } from './service-fetch-policy'
import { createProviderFetchError, getCursorTargetKey } from './service-foundation'

export abstract class RateLimitFetchAllCycle extends RateLimitFetchPolicy {
  protected async runFetchAllCycle(signal: AbortSignal): Promise<void> {
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
    const codexTarget = this.codexFetchTarget
    const codexHomePath = this.codexHomePathResolver?.(codexTarget) ?? null
    const codexProvenance = this.getCodexProvenance(codexTarget, codexHomePath)
    const codexGeneration = this.codexFetchGeneration
    const cursorTarget = this.cursorRateLimitTargetResolver(this.cursorRateLimitRefreshContext)
    const cursorTargetChanged =
      getCursorTargetKey(cursorTarget) !== getCursorTargetKey(this.cursorFetchTarget)
    if (cursorTargetChanged) {
      this.cursorFetchTarget = cursorTarget
      this.cursorFetchGeneration += 1
      this.activeFailureStreakByProvider.cursor = 0
    }
    const cursorGeneration = this.cursorFetchGeneration
    const previousState = this.state
    const openCodeGoConfig = this.openCodeGoConfigResolver?.()
    const cookie = openCodeGoConfig?.sessionCookie ?? ''
    const workspaceIdOverride = openCodeGoConfig?.workspaceIdOverride ?? ''
    const miniMaxConfigResult = this.resolveMiniMaxConfig()
    const miniMaxCookie = miniMaxConfigResult.config.sessionCookie
    const miniMaxGroupId = miniMaxConfigResult.config.groupId
    const miniMaxModels = miniMaxConfigResult.config.models
    const geminiCliOAuthEnabled = this.geminiCliOAuthEnabledResolver?.() ?? false
    // Why: getState() is used by renderer pushes and mobile snapshots; keep
    // Grok's sync auth-file probe on fetch cycles instead of every state read.
    const grokAuthReadResult = readGrokAuthSession()
    this.grokAuthConfigured = grokAuthReadResult.status === 'ok'

    // Detect if configuration changed — if it did, we must discard any stale
    // data because it belongs to a different session/workspace.
    const currentConfigHash = `${cookie}|${workspaceIdOverride}`
    const opencodeConfigChanged = currentConfigHash !== this.lastOpencodeConfigHash
    if (opencodeConfigChanged) {
      this.lastOpencodeConfigHash = currentConfigHash
      this.opencodeFetchGeneration += 1
    }
    const opencodeGeneration = this.opencodeFetchGeneration

    const currentMiniMaxConfigHash = `${miniMaxCookie}|${miniMaxGroupId}|${miniMaxModels}|${miniMaxConfigResult.error ?? ''}`
    const miniMaxConfigChanged = currentMiniMaxConfigHash !== this.lastMiniMaxConfigHash
    if (miniMaxConfigChanged) {
      this.lastMiniMaxConfigHash = currentMiniMaxConfigHash
      this.minimaxFetchGeneration += 1
    }
    const miniMaxGeneration = this.minimaxFetchGeneration

    // Mark all providers as fetching while keeping previous data visible.
    // Codex account changes clear Codex separately before this method is
    // called, so ordinary refreshes still preserve the current values.
    this.updateState({
      ...previousState,
      claude: this.withFetchingStatus(previousState.claude, 'claude'),
      codex: this.withFetchingStatus(previousState.codex, 'codex'),
      cursor: this.withFetchingStatus(cursorTargetChanged ? null : previousState.cursor, 'cursor'),
      gemini: this.withFetchingStatus(previousState.gemini, 'gemini'),
      opencodeGo: opencodeConfigChanged
        ? this.withFetchingStatus(null, 'opencode-go')
        : this.withFetchingStatus(previousState.opencodeGo, 'opencode-go'),
      kimi: this.withFetchingStatus(previousState.kimi, 'kimi'),
      antigravity: this.withFetchingStatus(previousState.antigravity, 'antigravity'),
      minimax: miniMaxConfigChanged
        ? this.withFetchingStatus(null, 'minimax')
        : this.withFetchingStatus(previousState.minimax, 'minimax'),
      grok: this.withFetchingStatus(previousState.grok, 'grok')
    })

    const missingWslCodexHome = codexHomePath
      ? null
      : this.getMissingWslCodexHomeResult(codexTarget)
    const grokResultPromise = fetchGrokRateLimits({
      signal,
      authReadResult: grokAuthReadResult
    }).then(
      (value) => ({ status: 'fulfilled', value }) as const,
      (reason) => ({ status: 'rejected', reason }) as const
    )

    const [
      claudeResult,
      codexResult,
      cursorResult,
      geminiResult,
      opencodeGoResult,
      kimiResult,
      miniMaxResult
    ] = await Promise.allSettled([
      fetchClaudeRateLimits({
        authPreparation: claudeAuthPreparation,
        allowPtyFallback: this.shouldAllowClaudePtyFallback(claudeAuthPreparation),
        allowUsagePanelSupplement: this.shouldAllowClaudeUsagePanelSupplement(),
        networkProxySettings: this.networkProxySettingsResolver?.(),
        signal
      }),
      missingWslCodexHome ??
        fetchCodexRateLimits({
          codexHomePath,
          signal
        }),
      fetchCursorUsageForRuntime({
        signal,
        target: cursorTarget,
        remoteFetcher: this.remoteCursorUsageFetcher
      }),
      fetchGeminiRateLimits(geminiCliOAuthEnabled),
      fetchOpenCodeGoRateLimits(cookie, workspaceIdOverride || undefined),
      fetchKimiRateLimits(),
      miniMaxConfigResult.error
        ? Promise.resolve(this.getMiniMaxCredentialError(miniMaxConfigResult.error))
        : fetchMiniMaxRateLimits({
            cookie: miniMaxCookie,
            groupId: miniMaxGroupId,
            models: miniMaxModels
          })
    ])

    if (signal.aborted) {
      return
    }

    const claude =
      claudeResult.status === 'fulfilled'
        ? claudeResult.value
        : createProviderFetchError('claude', claudeResult.reason)

    const codex =
      codexResult.status === 'fulfilled'
        ? codexResult.value
        : createProviderFetchError('codex', codexResult.reason)

    const cursor =
      cursorResult.status === 'fulfilled'
        ? cursorResult.value
        : createProviderFetchError('cursor', cursorResult.reason)

    const gemini =
      geminiResult.status === 'fulfilled'
        ? geminiResult.value
        : createProviderFetchError('gemini', geminiResult.reason)

    // Why: Antigravity shares Google/Gemini usage credentials today; mirror the
    // Gemini snapshot under provider 'antigravity' so status-bar UI that checks
    // antigravity state receives a real fetch lifecycle instead of staying null.
    const antigravity: ProviderRateLimits = {
      ...gemini,
      provider: 'antigravity'
    }

    const opencodeGo =
      opencodeGoResult.status === 'fulfilled'
        ? opencodeGoResult.value
        : createProviderFetchError('opencode-go', opencodeGoResult.reason, true)

    const kimi =
      kimiResult.status === 'fulfilled'
        ? kimiResult.value
        : createProviderFetchError('kimi', kimiResult.reason)

    const miniMax =
      miniMaxResult.status === 'fulfilled'
        ? miniMaxResult.value
        : createProviderFetchError('minimax', miniMaxResult.reason)

    const latestCodexHomePath = this.codexHomePathResolver?.(codexTarget) ?? null
    const latestClaudeAuthPreparation = await this.claudeAuthPreparationResolver?.(claudeTarget)
    if (signal.aborted) {
      return
    }
    const latestClaudeProvenance = latestClaudeAuthPreparation?.provenance ?? 'system'
    const latestCodexProvenance = this.getCodexProvenance(codexTarget, latestCodexHomePath)
    const shouldApplyCodex =
      codexGeneration === this.codexFetchGeneration && codexProvenance === latestCodexProvenance
    const shouldApplyClaude =
      claudeGeneration === this.claudeFetchGeneration &&
      claudeProvenance === latestClaudeProvenance &&
      this.isSameClaudeTarget(claudeTarget, this.claudeFetchTarget)
    const latestCursorTarget = this.cursorRateLimitTargetResolver(
      this.cursorRateLimitRefreshContext
    )
    const shouldApplyCursor =
      cursorGeneration === this.cursorFetchGeneration &&
      getCursorTargetKey(cursorTarget) === getCursorTargetKey(latestCursorTarget)
    const shouldApplyOpencode = opencodeGeneration === this.opencodeFetchGeneration
    const shouldApplyMiniMax = miniMaxGeneration === this.minimaxFetchGeneration

    if (shouldApplyClaude) {
      this.trackActiveFailureStreak('claude', claude)
    }
    if (shouldApplyCodex) {
      this.trackActiveFailureStreak('codex', codex)
    }
    if (shouldApplyCursor) {
      this.trackActiveFailureStreak('cursor', cursor)
    }
    this.trackActiveFailureStreak('gemini', gemini)
    this.trackActiveFailureStreak('antigravity', antigravity)
    if (shouldApplyOpencode) {
      this.trackActiveFailureStreak('opencode-go', opencodeGo)
    }
    this.trackActiveFailureStreak('kimi', kimi)
    if (shouldApplyMiniMax) {
      this.trackActiveFailureStreak('minimax', miniMax)
    }

    // Why: account switches can race in-flight Codex fetches. Only apply a
    // Codex result if both the selected-account provenance and the request
    // generation still match, otherwise an old account could overwrite the
    // newly selected account's quota state.
    this.updateState({
      ...this.state,
      claude: shouldApplyClaude
        ? this.applyStalePolicy(claude, previousState.claude)
        : this.state.claude,
      codex: shouldApplyCodex
        ? this.applyStalePolicy(codex, previousState.codex)
        : this.state.codex,
      cursor: shouldApplyCursor
        ? cursorTargetChanged
          ? cursor
          : this.applyStalePolicy(cursor, previousState.cursor)
        : this.state.cursor,
      gemini: this.applyStalePolicy(gemini, previousState.gemini),
      opencodeGo: shouldApplyOpencode
        ? opencodeConfigChanged
          ? opencodeGo
          : this.applyStalePolicy(opencodeGo, previousState.opencodeGo)
        : this.state.opencodeGo,
      kimi: this.applyStalePolicy(kimi, previousState.kimi),
      antigravity: this.applyStalePolicy(antigravity, previousState.antigravity),
      minimax: shouldApplyMiniMax
        ? miniMaxConfigChanged
          ? miniMax
          : this.applyStalePolicy(miniMax, previousState.minimax)
        : this.state.minimax
    })

    const grokResult = await grokResultPromise
    if (signal.aborted) {
      return
    }
    const grok =
      grokResult.status === 'fulfilled'
        ? grokResult.value
        : createProviderFetchError('grok', grokResult.reason)
    this.trackActiveFailureStreak('grok', grok)
    this.updateState({
      ...this.state,
      grok: this.applyStalePolicy(grok, previousState.grok)
    })
  }
}
