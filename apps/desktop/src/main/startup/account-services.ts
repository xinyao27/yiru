import { CURSOR_USAGE_GET_CONTRACT } from '@yiru/runtime-protocol/contract'
import { app } from 'electron'

import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { browserManager } from '../browser/manager'
import { ClaudeRuntimeAuthService } from '../claude/accounts/runtime-auth-service'
import { normalizeClaudeRuntimeSelection } from '../claude/accounts/runtime-selection'
import { ClaudeAccountService } from '../claude/accounts/service'
import { ClaudeUsageStore } from '../claude/usage/store'
import { CodexRuntimeHomeService } from '../codex/accounts/runtime-home-service'
import { normalizeCodexRuntimeSelection } from '../codex/accounts/runtime-selection'
import { CodexAccountService } from '../codex/accounts/service'
import { setSystemCodexHomeHookSweepSuppressed } from '../codex/hook-service'
import { isRealHomeCodexHookLaneUsable } from '../codex/real-home-hook-install'
import { startCodexSessionBackfillInBackground } from '../codex/session-backfill'
import { startCodexSessionIndexHealInBackground } from '../codex/session-index-heal'
import { resolveHostCodexSessionSourceHome } from '../codex/session-source-home'
import { CodexUsageStore } from '../codex/usage/store'
import { KeybindingService } from '../keybindings/keybinding-service'
import { readMiniMaxSessionCookie } from '../minimax/cookie-store'
import { OpenCodeUsageStore } from '../opencode/usage/store'
import type { Store } from '../persistence'
import { getInitialClaudeRateLimitTarget } from '../rate-limits/claude-rate-limit-target'
import { getInitialCodexRateLimitTarget } from '../rate-limits/codex-rate-limit-target'
import { RateLimitService } from '../rate-limits/service'
import { resolveCursorUsageRuntimeTarget } from '../runtime/cursor-usage/target'
import { callRuntimeEnvironment } from '../runtime/environment-transport-routing'
import { StatsCollector } from '../stats/collector'

export type AccountServices = {
  stats: StatsCollector
  claudeUsage: ClaudeUsageStore
  codexUsage: CodexUsageStore
  openCodeUsage: OpenCodeUsageStore
  rateLimits: RateLimitService
  codexRuntimeHome: CodexRuntimeHomeService
  codexAccounts: CodexAccountService
  claudeRuntimeAuth: ClaudeRuntimeAuthService
  claudeAccounts: ClaudeAccountService
  keybindings: KeybindingService
}

export function initializeAccountServices(
  store: Store,
  options: { isQuitting: () => boolean }
): AccountServices {
  const stats = new StatsCollector()
  const claudeUsage = new ClaudeUsageStore(store)
  const codexUsage = new CodexUsageStore(store)
  const openCodeUsage = new OpenCodeUsageStore(store)
  const rateLimits = new RateLimitService()
  const codexRuntimeHome = new CodexRuntimeHomeService(store)
  codexRuntimeHome.setRealHomeLaneGate(() => isRealHomeCodexHookLaneUsable())
  setSystemCodexHomeHookSweepSuppressed(
    () =>
      codexRuntimeHome.isHostSystemDefaultRealHome() &&
      isAgentStatusHooksEnabled(store.getSettings())
  )
  const codexAccounts = new CodexAccountService(store, rateLimits, codexRuntimeHome)
  setTimeout(() => {
    if (!codexRuntimeHome.isHostSystemDefaultRealHome()) {
      return
    }
    const sourceHome = resolveHostCodexSessionSourceHome(store.getSettings())
    const shouldStop = (): boolean =>
      options.isQuitting() || !codexRuntimeHome.isHostSystemDefaultRealHome()
    void startCodexSessionBackfillInBackground({ shouldStop }, sourceHome).then(() => {
      if (codexRuntimeHome.isHostSystemDefaultRealHome()) {
        return startCodexSessionIndexHealInBackground({ shouldStop }, sourceHome)
      }
      return undefined
    })
  }, 15_000)

  const claudeRuntimeAuth = new ClaudeRuntimeAuthService(store)
  const claudeAccounts = new ClaudeAccountService(store, rateLimits, claudeRuntimeAuth)
  rateLimits.setCodexHomePathResolver((target) => codexRuntimeHome.prepareForRateLimitFetch(target))
  rateLimits.setCodexFetchTarget(getInitialCodexRateLimitTarget(store.getSettings()))
  rateLimits.setClaudeFetchTarget(getInitialClaudeRateLimitTarget(store.getSettings()))
  rateLimits.setCursorRateLimitTargetResolver((context) =>
    resolveCursorUsageRuntimeTarget(store, context, process.platform)
  )
  rateLimits.setRemoteCursorUsageFetcher(async (environmentId, signal) => {
    if (signal?.aborted) {
      throw new Error('Rate-limit fetch aborted')
    }
    const response = await callRuntimeEnvironment(
      app.getPath('userData'),
      environmentId,
      CURSOR_USAGE_GET_CONTRACT,
      undefined,
      40_000
    )
    if (signal?.aborted) {
      throw new Error('Rate-limit fetch aborted')
    }
    if (response.ok === false) {
      throw new Error(response.error.message)
    }
    return response.result
  })
  rateLimits.setClaudeAuthPreparationResolver((target) =>
    claudeRuntimeAuth.prepareForRateLimitFetch(target)
  )
  rateLimits.setOpenCodeGoConfigResolver(() => {
    const settings = store.getSettings()
    return {
      sessionCookie: settings.opencodeSessionCookie,
      workspaceIdOverride: settings.opencodeWorkspaceId
    }
  })
  rateLimits.setMiniMaxConfigResolver(() => {
    const settings = store.getSettings()
    return {
      sessionCookie: readMiniMaxSessionCookie() ?? '',
      groupId: settings.minimaxGroupId,
      models: settings.minimaxUsageModels
    }
  })
  rateLimits.setGeminiCliOAuthEnabledResolver(() => store.getSettings().geminiCliOAuthEnabled)
  rateLimits.setNetworkProxySettingsResolver(() => store.getSettings())

  const keybindings = new KeybindingService({
    homePath: app.getPath('home'),
    getLegacyOverrides: () => store.getSettings().keybindings
  })
  browserManager.setSettingsResolver(() => ({ keybindings: keybindings.getOverrides() }))
  rateLimits.setInactiveClaudeAccountsResolver(() => {
    const settings = store.getSettings()
    const activeIds = new Set(
      [
        normalizeClaudeRuntimeSelection(settings).host,
        ...Object.values(normalizeClaudeRuntimeSelection(settings).wsl)
      ].filter(Boolean)
    )
    return settings.claudeManagedAccounts
      .filter((account) => !activeIds.has(account.id))
      .map((account) => ({
        id: account.id,
        managedAuthPath: account.managedAuthPath,
        managedAuthRuntime: account.managedAuthRuntime,
        wslDistro: account.wslDistro,
        wslLinuxAuthPath: account.wslLinuxAuthPath
      }))
  })
  rateLimits.setInactiveCodexAccountsResolver(() => {
    const settings = store.getSettings()
    const activeIds = new Set(
      [
        normalizeCodexRuntimeSelection(settings).host,
        ...Object.values(normalizeCodexRuntimeSelection(settings).wsl)
      ].filter(Boolean)
    )
    return settings.codexManagedAccounts
      .filter((account) => !activeIds.has(account.id))
      .map((account) => ({ id: account.id, managedHomePath: account.managedHomePath }))
  })

  return {
    stats,
    claudeUsage,
    codexUsage,
    openCodeUsage,
    rateLimits,
    codexRuntimeHome,
    codexAccounts,
    claudeRuntimeAuth,
    claudeAccounts,
    keybindings
  }
}
