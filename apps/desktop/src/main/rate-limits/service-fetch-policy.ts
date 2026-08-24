import type { ProviderRateLimits } from '~shared/rate-limit-types'

import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'
import type { NormalizedClaudeAccountSelectionTarget } from '../claude/accounts/runtime-selection'
import type { NormalizedCodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import { RateLimitFetchControl } from './service-fetch-control'
import {
  isSystemDefaultClaudeAuth,
  MAX_ACTIVE_FAILURE_STREAK,
  toErrorMessage,
  type ActiveRateLimitProvider,
  type MiniMaxResolvedConfig
} from './service-foundation'

export abstract class RateLimitFetchPolicy extends RateLimitFetchControl {
  protected resolveAndClearFetchIdleWaiters(): void {
    const resolvers = this.fetchIdleResolvers
    this.fetchIdleResolvers = []
    for (const resolve of resolvers) {
      resolve()
    }
  }

  protected isSameCodexTarget(
    left: NormalizedCodexAccountSelectionTarget,
    right: NormalizedCodexAccountSelectionTarget
  ): boolean {
    return left.runtime === right.runtime && left.wslDistro === right.wslDistro
  }

  protected isSameClaudeTarget(
    left: NormalizedClaudeAccountSelectionTarget,
    right: NormalizedClaudeAccountSelectionTarget
  ): boolean {
    return left.runtime === right.runtime && left.wslDistro === right.wslDistro
  }

  protected getCodexProvenance(
    target: NormalizedCodexAccountSelectionTarget,
    codexHomePath: string | null
  ): string {
    const targetKey = target.runtime === 'wsl' ? `wsl:${target.wslDistro ?? '__default__'}` : 'host'
    return codexHomePath ? `${targetKey}:managed:${codexHomePath}` : `${targetKey}:system`
  }

  protected getMissingWslCodexHomeResult(
    target: NormalizedCodexAccountSelectionTarget
  ): ProviderRateLimits | null {
    if (target.runtime !== 'wsl') {
      return null
    }
    return {
      provider: 'codex',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: `WSL Codex home unavailable for ${target.wslDistro ?? 'default distro'}`,
      status: 'error'
    }
  }

  protected shouldAllowClaudePtyFallback(
    authPreparation: ClaudeRuntimeAuthPreparation | undefined
  ): boolean {
    // Why: automatic recovery uses Claude CLI as the next source, but Windows
    // hidden PTY support remains less reliable than host/WSL shells.
    if (process.platform === 'win32') {
      return false
    }
    // Why: system-default Claude is not a Yiru-managed account. Background
    // quota refresh may read existing OAuth, but must not launch Claude and
    // trigger auth/browser flows for users who never configured Claude in Yiru.
    return !isSystemDefaultClaudeAuth(authPreparation)
  }

  protected shouldAllowClaudeUsagePanelSupplement(): boolean {
    // Why: this supplement runs only after OAuth has already returned usage
    // data. Keep it off on Windows where hidden PTYs are still less reliable.
    return process.platform !== 'win32'
  }

  protected resolveMiniMaxConfig(): MiniMaxResolvedConfig {
    try {
      return {
        config: this.miniMaxConfigResolver?.() ?? {
          sessionCookie: '',
          groupId: '',
          models: 'general'
        },
        error: null
      }
    } catch (error) {
      // Why: one unreadable browser cookie must not abort every provider's
      // quota refresh; surface it as MiniMax-only state instead.
      return {
        config: {
          sessionCookie: '',
          groupId: '',
          models: 'general'
        },
        error: toErrorMessage(error)
      }
    }
  }

  protected getMiniMaxCredentialError(message: string): ProviderRateLimits {
    return {
      provider: 'minimax',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: message,
      status: 'error',
      usageMetadata: { failureKind: 'keychain-unavailable', source: 'web' }
    }
  }

  protected trackActiveFailureStreak(
    provider: ActiveRateLimitProvider,
    fresh: ProviderRateLimits
  ): void {
    if (fresh.status === 'error') {
      this.activeFailureStreakByProvider[provider] = Math.min(
        this.activeFailureStreakByProvider[provider] + 1,
        MAX_ACTIVE_FAILURE_STREAK
      )
      return
    }
    if (fresh.status === 'ok' || fresh.status === 'unavailable') {
      this.activeFailureStreakByProvider[provider] = 0
    }
  }

  protected withFetchingStatus(
    current: ProviderRateLimits | null,
    provider:
      | 'claude'
      | 'codex'
      | 'cursor'
      | 'gemini'
      | 'opencode-go'
      | 'kimi'
      | 'minimax'
      | 'grok'
      | 'antigravity'
  ): ProviderRateLimits {
    if (!current) {
      return {
        provider,
        session: null,
        weekly: null,
        updatedAt: 0,
        error: null,
        status: 'fetching'
      }
    }
    // Why: repainting a settled chip as "fetching" on every background refetch
    // makes the status bar flash "…" → error each retry cycle when a provider
    // is persistently failing. Keep the settled state visible until the new
    // result lands; only providers with no settled state show a loading chip.
    if (current.status === 'ok' || current.status === 'error' || current.status === 'unavailable') {
      return current
    }
    return { ...current, status: 'fetching' }
  }

  protected abstract applyStalePolicy(
    fresh: ProviderRateLimits,
    previous: ProviderRateLimits | null
  ): ProviderRateLimits
}
