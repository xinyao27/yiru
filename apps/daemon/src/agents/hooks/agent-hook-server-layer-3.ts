import {
  parseLegacyNumericPaneKey,
  parsePaneKey
} from '@yiru/runtime-protocol/workbench/stable-pane-id'
import type { LegacyPaneKeyAliasEntry } from '@yiru/runtime-protocol/workbench/types'
import {
  hasPendingAgentResultText,
  movePaneCacheState,
  normalizeHookPayload,
  preparePendingGrokResultDiscovery
} from '~main/agents/core/hook-listener'
import type { AgentHookSource } from '~main/agents/core/hook-relay'

import type {
  EnrichedAgentHookEventPayload,
  PaneKeyAliasPersistenceListener
} from './agent-hook-server-foundation'
import {
  ASSISTANT_MESSAGE_RETRY_ATTEMPTS,
  ASSISTANT_MESSAGE_RETRY_MS,
  PANE_KEY_ALIASES_MAX,
  isValidPaneKey
} from './agent-hook-server-foundation'
import { AgentHookServerLayer2 } from './agent-hook-server-layer-2'

export abstract class AgentHookServerLayer3 extends AgentHookServerLayer2 {
  protected scheduleAssistantMessageRetry(
    source: AgentHookSource,
    body: unknown,
    original: EnrichedAgentHookEventPayload,
    attempt = 1,
    discoveryReady = false
  ): void {
    if (
      original.payload.lastAssistantMessage ||
      !hasPendingAgentResultText(source, body) ||
      attempt > ASSISTANT_MESSAGE_RETRY_ATTEMPTS
    ) {
      return
    }
    this.clearAssistantMessageRetry(original.paneKey)
    if (!discoveryReady) {
      const discovery = preparePendingGrokResultDiscovery(source, body)
      if (discovery) {
        // Why: slug-group discovery can outlive the bounded transcript-flush
        // timers. Its completion must drive the first retry deterministically.
        void discovery
          .then(() => {
            if (this.server) {
              this.applyAssistantMessageRetry(source, body, original, 1, true)
            }
          })
          .catch((err) => {
            console.error('[agent-hooks] Grok result discovery failed:', err)
          })
        return
      }
    }
    const timer = setTimeout(() => {
      try {
        this.assistantMessageRetryTimers.delete(original.paneKey)
        this.applyAssistantMessageRetry(source, body, original, attempt + 1, discoveryReady)
      } catch (err) {
        console.error('[agent-hooks] assistant message retry failed:', err)
      }
    }, ASSISTANT_MESSAGE_RETRY_MS)
    this.assistantMessageRetryTimers.set(original.paneKey, timer)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  protected applyAssistantMessageRetry(
    source: AgentHookSource,
    body: unknown,
    original: EnrichedAgentHookEventPayload,
    nextAttempt: number,
    requireExactOriginal: boolean
  ): void {
    const current = this.state.lastStatusByPaneKey.get(original.paneKey) as
      | EnrichedAgentHookEventPayload
      | undefined
    if (
      !current ||
      (requireExactOriginal && current !== original) ||
      current.payload.agentType !== original.payload.agentType ||
      current.payload.prompt !== original.payload.prompt ||
      current.payload.lastAssistantMessage
    ) {
      return
    }
    const normalized = normalizeHookPayload(this.state, source, body, this.env)
    if (!normalized?.payload.lastAssistantMessage) {
      this.scheduleAssistantMessageRetry(source, body, original, nextAttempt, requireExactOriginal)
      return
    }
    // Why: some agents POST Stop before their transcript/chat-history line is
    // flushed. Discovery is event-driven; subsequent content retries stay timed.
    this.applyNormalizedStatus(normalized)
  }

  setPaneKeyAliasPersistenceListener(listener: PaneKeyAliasPersistenceListener | null): void {
    this.paneKeyAliasPersistenceListener = listener
  }

  protected getPersistedPaneKeyAliases(): LegacyPaneKeyAliasEntry[] {
    return Array.from(this.legacyPaneKeyAliases.entries()).flatMap(([legacyPaneKey, entry]) =>
      entry.ptyId
        ? [
            {
              ptyId: entry.ptyId,
              legacyPaneKey,
              stablePaneKey: entry.stablePaneKey,
              updatedAt: entry.updatedAt
            }
          ]
        : []
    )
  }

  protected notifyPaneKeyAliasPersistenceListener(): void {
    this.paneKeyAliasPersistenceListener?.(this.getPersistedPaneKeyAliases())
  }

  protected boundPaneKeyAliases(): void {
    while (this.legacyPaneKeyAliases.size > PANE_KEY_ALIASES_MAX) {
      // Why: renderer-originated aliases are untrusted process-lifetime state;
      // insertion-order eviction bounds both memory and per-message cleanup.
      const oldestKey = this.legacyPaneKeyAliases.keys().next().value
      if (!oldestKey) {
        break
      }
      this.legacyPaneKeyAliases.delete(oldestKey)
    }
  }

  protected getPhysicalPaneKeyForAuthority(paneKey: string, ptyId?: string): string {
    const ownerPaneKey = this.resolvePaneKeyAlias(paneKey)
    let fallbackPaneKey = paneKey
    for (const [physicalPaneKey, entry] of this.legacyPaneKeyAliases) {
      if (
        entry.stablePaneKey === ownerPaneKey &&
        (!ptyId || !entry.ptyId || entry.ptyId === ptyId)
      ) {
        if (entry.authorityVerified) {
          return physicalPaneKey
        }
        fallbackPaneKey = physicalPaneKey
      }
    }
    return fallbackPaneKey
  }

  canTransferPaneAuthority(
    fromPaneKey: string,
    ptyId: string | undefined,
    ownsPty: (physicalPaneKey: string, ptyId: string) => boolean
  ): boolean {
    if (!isValidPaneKey(fromPaneKey)) {
      return false
    }
    const ownerPaneKey = this.resolvePaneKeyAlias(fromPaneKey)
    const physicalPaneKey = this.getPhysicalPaneKeyForAuthority(fromPaneKey, ptyId)
    const alias = this.legacyPaneKeyAliases.get(physicalPaneKey)
    if (ptyId) {
      return Boolean(
        (alias?.authorityVerified && alias.ptyId === ptyId) ||
        ownsPty(physicalPaneKey, ptyId) ||
        (ownerPaneKey !== physicalPaneKey && ownsPty(ownerPaneKey, ptyId))
      )
    }
    // Why: hook status is renderer-originated evidence, not PTY ownership.
    // ID-less moves are safe only after a prior verified transfer minted an alias.
    return alias?.authorityVerified === true
  }

  registerPaneKeyAlias(
    legacyPaneKey: string,
    stablePaneKey: string,
    ptyId?: string,
    updatedAt = Date.now(),
    options?: { overwriteExisting?: boolean; authorityVerified?: boolean }
  ): void {
    const legacy = parseLegacyNumericPaneKey(legacyPaneKey)
    const stable = isValidPaneKey(stablePaneKey) ? parsePaneKey(stablePaneKey) : null
    if (!legacy || !stable || legacy.tabId !== stable.tabId) {
      return
    }
    const existing = this.legacyPaneKeyAliases.get(legacy.paneKey)
    if (existing && options?.overwriteExisting === false) {
      return
    }
    const normalizedPtyId =
      typeof ptyId === 'string' && ptyId.trim().length > 0 ? ptyId.trim() : existing?.ptyId
    const normalizedUpdatedAt =
      Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : (existing?.updatedAt ?? Date.now())
    const authorityVerified = options?.authorityVerified ?? false
    if (
      existing &&
      existing.stablePaneKey === stablePaneKey &&
      existing.ptyId === (normalizedPtyId ?? null) &&
      existing.updatedAt === normalizedUpdatedAt &&
      existing.authorityVerified === authorityVerified
    ) {
      return
    }
    this.legacyPaneKeyAliases.set(legacy.paneKey, {
      stablePaneKey,
      ptyId: normalizedPtyId ?? null,
      updatedAt: normalizedUpdatedAt,
      authorityVerified
    })
    this.boundPaneKeyAliases()
    if (normalizedPtyId) {
      this.notifyPaneKeyAliasPersistenceListener()
    }
  }

  transferPaneAuthority(
    fromPaneKey: string,
    toPaneKey: string,
    ptyId?: string,
    updatedAt = Date.now(),
    options?: { authorityVerified?: boolean }
  ): void {
    if (!isValidPaneKey(fromPaneKey) || !isValidPaneKey(toPaneKey)) {
      return
    }
    const previousOwnerPaneKey = this.resolvePaneKeyAlias(fromPaneKey)
    const physicalPaneKey = this.getPhysicalPaneKeyForAuthority(fromPaneKey, ptyId)
    const existing = this.legacyPaneKeyAliases.get(physicalPaneKey)
    const normalizedPtyId = ptyId?.trim() || existing?.ptyId || null
    const hadStatus = this.state.lastStatusByPaneKey.has(previousOwnerPaneKey)
    movePaneCacheState(this.state, previousOwnerPaneKey, toPaneKey)
    const movedStatus = this.state.lastStatusByPaneKey.get(toPaneKey) as
      | EnrichedAgentHookEventPayload
      | undefined
    if (movedStatus) {
      const owner = parsePaneKey(toPaneKey)
      this.state.lastStatusByPaneKey.set(toPaneKey, {
        ...movedStatus,
        paneKey: toPaneKey,
        tabId: owner?.tabId
      })
    }
    if (this.runtimeObservedStatusPaneKeys.delete(previousOwnerPaneKey)) {
      this.runtimeObservedStatusPaneKeys.add(toPaneKey)
    }
    const promptDedupe = this.promptSentDedupeByPaneKey.get(previousOwnerPaneKey)
    if (promptDedupe !== undefined) {
      this.promptSentDedupeByPaneKey.delete(previousOwnerPaneKey)
      this.promptSentDedupeByPaneKey.set(toPaneKey, promptDedupe)
    }
    this.clearAssistantMessageRetry(previousOwnerPaneKey)
    // Why: the live process keeps posting the physical source key after detach;
    // persist one chain-safe mapping to whichever surface currently owns it.
    this.legacyPaneKeyAliases.set(physicalPaneKey, {
      stablePaneKey: toPaneKey,
      ptyId: normalizedPtyId,
      updatedAt,
      authorityVerified: options?.authorityVerified ?? true
    })
    this.boundPaneKeyAliases()
    this.closedAgentStatusPaneKeys.delete(toPaneKey)
    this.notifyPaneKeyAliasPersistenceListener()
    if (hadStatus) {
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
    }
  }
}
