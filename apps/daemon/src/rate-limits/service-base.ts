import type { NetworkProxySettings } from '@yiru/runtime-protocol/workbench/network-proxy'
import type {
  CursorRateLimitRefreshContext,
  ProviderRateLimits,
  RateLimitState
} from '@yiru/runtime-protocol/workbench/rate-limit-types'

import {
  normalizeClaudeAccountSelectionTarget,
  type ClaudeAccountSelectionTarget,
  type NormalizedClaudeAccountSelectionTarget
} from '../agents/claude/accounts/runtime-selection'
import {
  normalizeCodexAccountSelectionTarget,
  type CodexAccountSelectionTarget,
  type NormalizedCodexAccountSelectionTarget
} from '../agents/codex/accounts/runtime-selection'
import { hasMiniMaxSessionCookie } from '../agents/minimax/cookie-store'
import type { RemoteCursorUsageFetcher } from '../runtime/cursor-usage/client'
import type { CursorUsageRuntimeTarget } from '../runtime/cursor-usage/target'
import type { InactiveClaudeAccountInfo } from './claude-fetcher'
import { readGrokAuthSession } from './grok-auth'
import { RateLimitServiceContract } from './service-contract'
import {
  DEFAULT_POLL_MS,
  getCursorTargetKey,
  type ActiveRateLimitProvider,
  type ClaudeAuthPreparationResolver,
  type CodexHomePathResolver,
  type CursorRateLimitTargetResolver,
  type GeminiCliOAuthEnabledResolver,
  type InactiveCodexAccountInfo,
  type InternalRateLimitState,
  type MiniMaxRateLimitConfig,
  type OpenCodeGoRateLimitConfig
} from './service-foundation'

type RateLimitWindowEvent = 'closed' | 'focus' | 'restore' | 'show'

type RateLimitWindow = {
  isDestroyed: () => boolean
  isFocused: () => boolean
  isMinimized: () => boolean
  isVisible: () => boolean
  on: (event: RateLimitWindowEvent, listener: () => void) => void
  removeListener: (event: RateLimitWindowEvent, listener: () => void) => void
}

export abstract class RateLimitServiceBase extends RateLimitServiceContract {
  protected state: InternalRateLimitState = {
    claude: null,
    codex: null,
    cursor: null,
    gemini: null,
    opencodeGo: null,
    kimi: null,
    antigravity: null,
    minimax: null,
    grok: null
  }
  protected grokAuthConfigured = readGrokAuthSession().status === 'ok'
  protected pollInterval: number = DEFAULT_POLL_MS
  protected timer: ReturnType<typeof setInterval> | null = null
  protected deferredStartupRefreshTimer: ReturnType<typeof setTimeout> | null = null
  // Why: after the first recovery attempt, repeated focus/show/restore events
  // during the same outage should not create a tight provider retry loop.
  protected lastActiveFailureRetryAtByProvider: Record<ActiveRateLimitProvider, number> = {
    claude: 0,
    codex: 0,
    cursor: 0,
    gemini: 0,
    'opencode-go': 0,
    kimi: 0,
    minimax: 0,
    grok: 0,
    antigravity: 0
  }
  // Why: consecutive applied failures per provider drive exponential backoff of
  // the fast activation-retry lane; reset on any successful/unavailable result.
  protected activeFailureStreakByProvider: Record<ActiveRateLimitProvider, number> = {
    claude: 0,
    codex: 0,
    cursor: 0,
    gemini: 0,
    'opencode-go': 0,
    kimi: 0,
    minimax: 0,
    grok: 0,
    antigravity: 0
  }
  protected mainWindow: RateLimitWindow | null = null
  protected detachWindowListeners: (() => void) | null = null
  protected isFetching = false
  protected fullFetchQueued = false
  protected codexOnlyFetchQueued = false
  protected claudeOnlyFetchQueued = false
  protected grokOnlyFetchQueued = false
  protected activeFetchAbortControllers = new Set<AbortController>()
  protected fetchIdleResolvers: (() => void)[] = []
  protected codexFetchGeneration = 0
  protected claudeFetchGeneration = 0
  protected cursorFetchGeneration = 0
  protected opencodeFetchGeneration = 0
  protected minimaxFetchGeneration = 0
  protected lastOpencodeConfigHash = ''
  protected lastMiniMaxConfigHash = ''
  protected codexHomePathResolver: CodexHomePathResolver | null = null
  protected codexFetchTarget: NormalizedCodexAccountSelectionTarget = {
    runtime: 'host',
    wslDistro: null
  }
  protected claudeAuthPreparationResolver: ClaudeAuthPreparationResolver | null = null
  protected claudeFetchTarget: NormalizedClaudeAccountSelectionTarget = {
    runtime: 'host',
    wslDistro: null
  }
  protected openCodeGoConfigResolver: (() => OpenCodeGoRateLimitConfig) | null = null
  protected miniMaxConfigResolver: (() => MiniMaxRateLimitConfig) | null = null
  protected geminiCliOAuthEnabledResolver: GeminiCliOAuthEnabledResolver | null = null
  protected cursorRateLimitRefreshContext: CursorRateLimitRefreshContext | null = null
  protected cursorFetchTarget: CursorUsageRuntimeTarget = { runtime: 'host' }
  protected cursorRateLimitTargetResolver: CursorRateLimitTargetResolver = () => ({
    runtime: 'host'
  })
  protected remoteCursorUsageFetcher: RemoteCursorUsageFetcher | undefined
  protected inactiveClaudeAccountsResolver: (() => InactiveClaudeAccountInfo[]) | null = null
  protected inactiveCodexAccountsResolver: (() => InactiveCodexAccountInfo[]) | null = null
  protected networkProxySettingsResolver: (() => NetworkProxySettings) | null = null
  protected inactiveClaudeCache = new Map<string, ProviderRateLimits>()
  protected inactiveCodexCache = new Map<string, ProviderRateLimits>()
  protected inactiveClaudeFetching = new Set<string>()
  protected inactiveCodexFetching = new Set<string>()
  protected lastInactiveClaudeFetchAt = 0
  protected inactiveClaudeAccountsGeneration = 0
  protected lastInactiveCodexFetchAt = 0
  protected inactiveCodexAccountsGeneration = 0
  protected stateListeners = new Set<(state: RateLimitState) => void>()

  constructor() {
    super()
  }

  onStateChange(listener: (state: RateLimitState) => void): () => void {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  setCodexHomePathResolver(resolver: CodexHomePathResolver): void {
    this.codexHomePathResolver = resolver
  }

  setCodexFetchTarget(target?: CodexAccountSelectionTarget): void {
    this.codexFetchTarget = normalizeCodexAccountSelectionTarget(target)
  }

  setClaudeAuthPreparationResolver(resolver: ClaudeAuthPreparationResolver): void {
    this.claudeAuthPreparationResolver = resolver
  }

  setClaudeFetchTarget(target?: ClaudeAccountSelectionTarget): void {
    this.claudeFetchTarget = normalizeClaudeAccountSelectionTarget(target)
  }

  setOpenCodeGoConfigResolver(resolver: () => OpenCodeGoRateLimitConfig): void {
    this.openCodeGoConfigResolver = resolver
  }

  setMiniMaxConfigResolver(resolver: () => MiniMaxRateLimitConfig): void {
    this.miniMaxConfigResolver = resolver
  }

  setGeminiCliOAuthEnabledResolver(resolver: GeminiCliOAuthEnabledResolver): void {
    this.geminiCliOAuthEnabledResolver = resolver
  }

  setCursorRateLimitTargetResolver(resolver: CursorRateLimitTargetResolver): void {
    this.cursorRateLimitTargetResolver = resolver
  }

  setRemoteCursorUsageFetcher(fetcher: RemoteCursorUsageFetcher): void {
    this.remoteCursorUsageFetcher = fetcher
  }

  setNetworkProxySettingsResolver(resolver: () => NetworkProxySettings): void {
    this.networkProxySettingsResolver = resolver
  }

  setInactiveClaudeAccountsResolver(resolver: () => InactiveClaudeAccountInfo[]): void {
    this.inactiveClaudeAccountsResolver = resolver
    this.inactiveClaudeAccountsGeneration += 1
  }

  setInactiveCodexAccountsResolver(resolver: () => InactiveCodexAccountInfo[]): void {
    this.inactiveCodexAccountsResolver = resolver
    this.inactiveCodexAccountsGeneration += 1
    this.pruneInactiveCodexState()
  }

  attach(mainWindow: RateLimitWindow): void {
    this.detachWindowListeners?.()
    this.mainWindow = mainWindow
    const refreshOnResume = (): void => {
      void this.refreshIfWindowActive()
    }
    // Why: attach() can replace windows; the previous closed listener also
    // captures this service and must be removed with the focus listeners.
    const detachWindowListeners = (): void => {
      mainWindow.removeListener('focus', refreshOnResume)
      mainWindow.removeListener('show', refreshOnResume)
      mainWindow.removeListener('restore', refreshOnResume)
      mainWindow.removeListener('closed', onClosed)
    }
    const onClosed = (): void => {
      detachWindowListeners()
      if (this.detachWindowListeners === detachWindowListeners) {
        this.detachWindowListeners = null
      }
      if (this.mainWindow === mainWindow) {
        this.mainWindow = null
      }
    }
    mainWindow.on('focus', refreshOnResume)
    mainWindow.on('show', refreshOnResume)
    mainWindow.on('restore', refreshOnResume)
    mainWindow.on('closed', onClosed)
    this.detachWindowListeners = detachWindowListeners
  }

  start(options: { fetchImmediately?: boolean } = {}): void {
    if (options.fetchImmediately !== false) {
      void this.fetchAll()
    } else {
      this.scheduleDeferredStartupRefresh()
    }
    this.startTimer()
  }

  stop(): void {
    this.abortActiveFetchCycle()
    this.clearQueuedFetches()
    this.inactiveClaudeFetching.clear()
    this.inactiveCodexFetching.clear()
    this.resolveAndClearFetchIdleWaiters()
    this.stopTimer()
    this.clearDeferredStartupRefresh()
    this.detachWindowListeners?.()
    this.detachWindowListeners = null
    this.mainWindow = null
  }

  getState(): RateLimitState {
    this.pruneInactiveClaudeState()
    this.pruneInactiveCodexState()
    return {
      ...this.state,
      // Why: the cookie lives in the file system, not GlobalSettings. Surface
      // its presence on the pushed state so the renderer keeps the MiniMax
      // bar visible across reloads and between snapshot refreshes.
      minimaxCookieConfigured: hasMiniMaxSessionCookie(),
      grokAuthConfigured: this.grokAuthConfigured,
      claudeTarget: this.claudeFetchTarget,
      codexTarget: this.codexFetchTarget,
      inactiveClaudeAccounts: this.buildInactiveArray(
        this.inactiveClaudeCache,
        this.inactiveClaudeFetching
      ),
      inactiveCodexAccounts: this.buildInactiveArray(
        this.inactiveCodexCache,
        this.inactiveCodexFetching
      )
    }
  }

  async refresh(cursorContext?: CursorRateLimitRefreshContext): Promise<RateLimitState> {
    // Why: the explicit refresh button is a user-directed recovery action.
    // Debouncing it behind the background poll throttle makes the UI feel
    // broken after wake/focus transitions because the click can no-op even
    // though the user is asking for a fresh read right now.
    if (cursorContext) {
      this.setCursorRefreshContext(cursorContext)
    }
    await this.fetchAll({ force: true })
    return this.getState()
  }

  protected setCursorRefreshContext(context: CursorRateLimitRefreshContext): void {
    this.cursorRateLimitRefreshContext = context
    const nextTarget = this.cursorRateLimitTargetResolver(context)
    if (getCursorTargetKey(nextTarget) === getCursorTargetKey(this.cursorFetchTarget)) {
      return
    }
    this.cursorFetchTarget = nextTarget
    this.cursorFetchGeneration += 1
    this.activeFailureStreakByProvider.cursor = 0
    // Why: a target change is an identity change. Clear the prior host's quota
    // before queuing work so an in-flight fetch cannot leave it visible.
    this.updateState({
      ...this.state,
      cursor: this.withFetchingStatus(null, 'cursor')
    })
  }

  async refreshIfStale(): Promise<RateLimitState> {
    // Why: reconnecting mobile subscribers need fresh backgrounded-desktop data,
    // but replaying a subscription must not queue another forced provider fetch.
    const plan = this.getActiveWindowRefreshPlan(Date.now())
    await this.runActiveWindowRefreshPlan(plan)
    return this.getState()
  }

  async refreshGrok(): Promise<RateLimitState> {
    await this.fetchGrokOnly({ force: true })
    return this.getState()
  }

  invalidateMiniMaxCredentialState(): void {
    this.minimaxFetchGeneration += 1
    // Why: saving or forgetting the browser cookie can race an in-flight usage
    // fetch; clear the visible snapshot before any old-cookie result returns.
    this.updateState({
      ...this.state,
      minimax: this.withFetchingStatus(null, 'minimax')
    })
  }
}
