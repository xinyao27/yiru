import type { ParsedAgentStatusPayload } from '@yiru/runtime-protocol/model/agent'
import { parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import { clearPaneCacheState, MAX_PANE_KEY_LEN } from '~main/agents/core/hook-listener'

import { track } from '../../telemetry/client'
import type { EnrichedAgentHookEventPayload } from './agent-hook-server-foundation'
import { AgentHookServerLayer3 } from './agent-hook-server-layer-3'
import { equivalentParsedAgentStatusPayload } from './agent-hook-status-normalization'

export abstract class AgentHookServerLayer4 extends AgentHookServerLayer3 {
  retirePaneAuthority(paneKey: string): void {
    const ownerPaneKey = this.resolvePaneKeyAlias(paneKey)
    const paneKeys = new Set([paneKey, ownerPaneKey])
    let aliasChanged = false
    for (const [physicalPaneKey, entry] of this.legacyPaneKeyAliases) {
      if (physicalPaneKey === paneKey || entry.stablePaneKey === ownerPaneKey) {
        this.legacyPaneKeyAliases.delete(physicalPaneKey)
        paneKeys.add(physicalPaneKey)
        paneKeys.add(entry.stablePaneKey)
        aliasChanged = true
      }
    }
    const hadStatus = [...paneKeys].some((key) => this.state.lastStatusByPaneKey.has(key))
    for (const key of paneKeys) {
      this.markPaneClosedForAgentStatus(key)
      this.clearAssistantMessageRetry(key)
      clearPaneCacheState(this.state, key)
      this.runtimeObservedStatusPaneKeys.delete(key)
      this.promptSentDedupeByPaneKey.delete(key)
    }
    if (aliasChanged) {
      this.notifyPaneKeyAliasPersistenceListener()
    }
    if (hadStatus) {
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
    }
  }

  clearPaneKeyAliasesForPty(
    ptyId: string,
    options?: { shouldClearStablePaneKey?: (paneKey: string) => boolean }
  ): void {
    let aliasChanged = false
    let statusChanged = false
    const clearedStatusPaneKeys = new Set<string>()
    for (const [legacyPaneKey, entry] of this.legacyPaneKeyAliases) {
      if (entry.ptyId === ptyId) {
        this.legacyPaneKeyAliases.delete(legacyPaneKey)
        clearPaneCacheState(this.state, legacyPaneKey)
        this.promptSentDedupeByPaneKey.delete(legacyPaneKey)
        const shouldClearStablePaneKey =
          options?.shouldClearStablePaneKey?.(entry.stablePaneKey) ?? true
        if (shouldClearStablePaneKey && this.state.lastStatusByPaneKey.has(entry.stablePaneKey)) {
          statusChanged = true
          clearedStatusPaneKeys.add(entry.stablePaneKey)
        }
        if (shouldClearStablePaneKey) {
          // Why: after hydrate, legacy rows are stored under the stable key. If
          // this PTY is later proven dead before ptyPaneKey is rebuilt, alias
          // cleanup is the only path that can evict that retained status.
          clearPaneCacheState(this.state, entry.stablePaneKey)
          this.runtimeObservedStatusPaneKeys.delete(entry.stablePaneKey)
          this.promptSentDedupeByPaneKey.delete(entry.stablePaneKey)
        }
        aliasChanged = true
      }
    }
    if (aliasChanged) {
      this.notifyPaneKeyAliasPersistenceListener()
    }
    if (statusChanged) {
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
      for (const paneKey of clearedStatusPaneKeys) {
        this.onPaneStatusCleared?.(paneKey)
      }
    }
  }

  protected resolvePaneKeyAlias(paneKey: string): string {
    return this.legacyPaneKeyAliases.get(paneKey)?.stablePaneKey ?? paneKey
  }

  protected normalizeHookBodyPaneKeyAlias(body: unknown): unknown {
    if (typeof body !== 'object' || body === null) {
      return body
    }
    const record = body as Record<string, unknown>
    const rawPaneKey = typeof record.paneKey === 'string' ? record.paneKey.trim() : ''
    const stablePaneKey = this.legacyPaneKeyAliases.get(rawPaneKey)?.stablePaneKey
    if (!stablePaneKey) {
      return body
    }
    // Why: migrated and detached shells keep posting an immutable physical
    // pane key; normalize both pane and tab identity to the current owner.
    return { ...record, paneKey: stablePaneKey, tabId: parsePaneKey(stablePaneKey)?.tabId }
  }

  ingestTerminalStatus(event: {
    paneKey: string
    tabId?: string
    worktreeId?: string
    connectionId?: string | null
    payload: ParsedAgentStatusPayload
  }): void {
    const physicalPaneKey = event.paneKey.trim()
    const paneKey = this.resolvePaneKeyAlias(physicalPaneKey)
    const parsedPaneKey = parsePaneKey(paneKey)
    if (paneKey.length === 0) {
      track('agent_hook_unattributed', { reason: 'empty_pane_key' })
      return
    }
    if (paneKey.length > MAX_PANE_KEY_LEN || !parsedPaneKey) {
      return
    }
    const reportedTabId =
      event.tabId !== undefined && event.tabId.trim().length > 0 ? event.tabId.trim() : undefined
    if (
      paneKey === physicalPaneKey &&
      reportedTabId !== undefined &&
      reportedTabId !== parsedPaneKey.tabId
    ) {
      return
    }
    const tabId = paneKey !== physicalPaneKey ? parsedPaneKey.tabId : reportedTabId
    if (this.shouldSuppressClosedTabStatus(paneKey)) {
      return
    }
    const worktreeId =
      event.worktreeId !== undefined && event.worktreeId.trim().length > 0
        ? event.worktreeId.trim()
        : undefined
    const connectionId =
      typeof event.connectionId === 'string' && event.connectionId.trim().length > 0
        ? event.connectionId.trim()
        : null
    const previous = this.state.lastStatusByPaneKey.get(paneKey) as
      | EnrichedAgentHookEventPayload
      | undefined
    if (
      previous?.connectionId === connectionId &&
      previous.tabId === tabId &&
      previous.worktreeId === worktreeId &&
      equivalentParsedAgentStatusPayload(previous.payload, event.payload)
    ) {
      return
    }
    // Why: OSC terminal status is a runtime/model observation, not a hook
    // prompt boundary. Keep prompt-sent telemetry tied to native hooks.
    this.applyNormalizedStatus({
      paneKey,
      tabId,
      worktreeId,
      connectionId,
      payload: event.payload
    })
  }
}
