import { ClaudeRuntimeAuthService } from '~main/claude/accounts/runtime-auth-service'
import { normalizeClaudeRuntimeSelection } from '~main/claude/accounts/runtime-selection'
import { ClaudeAccountService } from '~main/claude/accounts/service'
import { CodexRuntimeHomeService } from '~main/codex/accounts/runtime-home-service'
import { normalizeCodexRuntimeSelection } from '~main/codex/accounts/runtime-selection'
import { CodexAccountService } from '~main/codex/accounts/service'
import { readMiniMaxSessionCookie } from '~main/minimax/cookie-store'
import {
  closeNodeProxyDispatcher,
  setHttpFetchProxySettingsProvider
} from '~main/network/http-fetch'
import type { Store } from '~main/persistence'
import { getInitialClaudeRateLimitTarget } from '~main/rate-limits/claude-rate-limit-target'
import { getInitialCodexRateLimitTarget } from '~main/rate-limits/codex-rate-limit-target'
import { RateLimitService } from '~main/rate-limits/service'

import type { YiruRuntimeService } from '../yiru-runtime'

export type NodeRuntimeHostAccountServices = {
  dispose: () => void
  rateLimits: RateLimitService
}

export function attachNodeRuntimeHostAccountServices(
  runtime: YiruRuntimeService,
  store: Store
): NodeRuntimeHostAccountServices {
  const rateLimits = new RateLimitService()
  const codexRuntimeHome = new CodexRuntimeHomeService(store)
  const codexAccounts = new CodexAccountService(store, rateLimits, codexRuntimeHome)
  const claudeRuntimeAuth = new ClaudeRuntimeAuthService(store)
  const claudeAccounts = new ClaudeAccountService(store, rateLimits, claudeRuntimeAuth)

  rateLimits.setCodexHomePathResolver((target) => codexRuntimeHome.prepareForRateLimitFetch(target))
  rateLimits.setCodexFetchTarget(getInitialCodexRateLimitTarget(store.getSettings()))
  rateLimits.setClaudeFetchTarget(getInitialClaudeRateLimitTarget(store.getSettings()))
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
  setHttpFetchProxySettingsProvider(() => store.getSettings())
  rateLimits.setInactiveClaudeAccountsResolver(() => {
    const settings = store.getSettings()
    const selection = normalizeClaudeRuntimeSelection(settings)
    const activeIds = new Set([selection.host, ...Object.values(selection.wsl)].filter(Boolean))
    return (settings.claudeManagedAccounts ?? [])
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
    const selection = normalizeCodexRuntimeSelection(settings)
    const activeIds = new Set([selection.host, ...Object.values(selection.wsl)].filter(Boolean))
    return (settings.codexManagedAccounts ?? [])
      .filter((account) => !activeIds.has(account.id))
      .map((account) => ({ id: account.id, managedHomePath: account.managedHomePath }))
  })

  runtime.setAccountServices({ claudeAccounts, codexAccounts, rateLimits })
  return {
    dispose: () => {
      rateLimits.stop()
      setHttpFetchProxySettingsProvider(null)
      closeNodeProxyDispatcher()
    },
    rateLimits
  }
}
