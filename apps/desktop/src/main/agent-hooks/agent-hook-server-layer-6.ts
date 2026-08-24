import {
  clearAllListenerCaches,
  clearPaneCacheState,
  reapRestoredClaudeSubagentsForDeadPane
} from '~shared/agent/hook-listener'
import {
  claudeRosterHasRestoredSnapshotSubagent,
  claudeRosterHasWorkingSubagent,
  claudeRosterToSnapshots
} from '~shared/claude-subagent-roster'

import type { EnrichedAgentHookEventPayload } from './agent-hook-server-foundation'
import { AgentHookServerLayer5 } from './agent-hook-server-layer-5'
import { paneCacheKeyMatchesTab } from './agent-hook-status-normalization'

export abstract class AgentHookServerLayer6 extends AgentHookServerLayer5 {
  stop(): void {
    // Why: flush any pending debounced write to disk BEFORE we clear the
    // in-memory map. Quit-time state must be captured even if the trailing
    // timer was scheduled but had not yet fired; otherwise a multi-agent
    // run that ended its last hook event <250 ms before quit would lose
    // that final delta on relaunch.
    this.flushStatusPersistSync()
    this.server?.close()
    this.server = null
    this.port = 0
    this.token = ''
    this.env = 'production'
    this.onAgentStatus = null
    this.onPaneStatusCleared = null
    for (const timer of this.assistantMessageRetryTimers.values()) {
      clearTimeout(timer)
    }
    this.assistantMessageRetryTimers.clear()
    // Why: intentionally do NOT delete the endpoint file on stop(). A stale
    // file points at a dead port, which matches the fail-open policy. Unlink
    // would introduce a TOCTOU race vs. a concurrent Yiru instance.
    this.endpointDir = null
    this.endpointFilePathCache = null
    this.endpointFileWritten = false
    this.lastStatusFilePath = null
    this.lastWrittenJson = null
    this.forwardedPtyEnv = {}
    this.statusHydrated = false
    this.runtimeObservedStatusPaneKeys.clear()
    this.promptSentDedupeByPaneKey.clear()
    this.closedAgentStatusTabIds.clear()
    this.closedAgentStatusPaneKeys.clear()
    this.legacyPaneKeyAliases.clear()
    clearAllListenerCaches(this.state)
    this.notifyStatusChangeListeners()
  }

  /** Why: invoked from the renderer-driven agentStatus.drop procedure when a user
   *  dismisses a still-active pane's status row. We must NOT wipe
   *  lastPromptByPaneKey or lastToolByPaneKey here — the pane's agent may
   *  still be alive, and the next hook event would otherwise arrive with an
   *  empty prompt and missing tool snapshot until a fresh UserPromptSubmit
   *  lands. clearPaneState (which wipes all three caches) is the right shape
   *  only for PTY-teardown. */
  dropStatusEntry(paneKey: string): void {
    const resolvedPaneKey = this.resolvePaneKeyAlias(paneKey)
    if (!this.state.lastStatusByPaneKey.has(resolvedPaneKey)) {
      return
    }
    const existing = this.state.lastStatusByPaneKey.get(resolvedPaneKey)
    this.state.lastStatusByPaneKey.delete(resolvedPaneKey)
    this.clearAssistantMessageRetry(resolvedPaneKey)
    this.runtimeObservedStatusPaneKeys.delete(resolvedPaneKey)
    if (existing?.payload.state === 'done') {
      this.promptSentDedupeByPaneKey.delete(resolvedPaneKey)
    }
    this.scheduleStatusPersist()
    this.notifyStatusChangeListeners()
  }

  dropStatusEntriesByTabPrefix(tabId: string): void {
    this.markTabClosedForAgentStatus(tabId)
    const paneKeysToClear = new Set<string>()
    for (const key of this.state.lastStatusByPaneKey.keys()) {
      if (paneCacheKeyMatchesTab(key, tabId)) {
        paneKeysToClear.add(key)
      }
    }
    for (const key of this.state.lastPromptByPaneKey.keys()) {
      if (paneCacheKeyMatchesTab(key, tabId)) {
        paneKeysToClear.add(key.split('\0', 1)[0] ?? key)
      }
    }
    for (const key of this.state.lastToolByPaneKey.keys()) {
      if (paneCacheKeyMatchesTab(key, tabId)) {
        paneKeysToClear.add(key.split('\0', 1)[0] ?? key)
      }
    }
    for (const key of this.state.antigravityCompletedTranscriptByPaneKey.keys()) {
      if (paneCacheKeyMatchesTab(key, tabId)) {
        paneKeysToClear.add(key.split('\0', 1)[0] ?? key)
      }
    }
    for (const key of this.state.ampCompletedCacheKeys) {
      if (paneCacheKeyMatchesTab(key, tabId)) {
        paneKeysToClear.add(key.split('\0', 1)[0] ?? key)
      }
    }
    for (const paneKey of this.runtimeObservedStatusPaneKeys) {
      if (paneCacheKeyMatchesTab(paneKey, tabId)) {
        paneKeysToClear.add(paneKey)
      }
    }
    for (const paneKey of this.promptSentDedupeByPaneKey.keys()) {
      if (paneCacheKeyMatchesTab(paneKey, tabId)) {
        paneKeysToClear.add(paneKey)
      }
    }

    let aliasChanged = false
    for (const [legacyPaneKey, entry] of this.legacyPaneKeyAliases) {
      const ownerMatches = paneCacheKeyMatchesTab(entry.stablePaneKey, tabId)
      if (ownerMatches) {
        this.legacyPaneKeyAliases.delete(legacyPaneKey)
        paneKeysToClear.add(legacyPaneKey)
        paneKeysToClear.add(entry.stablePaneKey)
        this.markPaneClosedForAgentStatus(legacyPaneKey)
        this.markPaneClosedForAgentStatus(entry.stablePaneKey)
        aliasChanged = true
      }
    }

    let statusChanged = false
    for (const paneKey of paneKeysToClear) {
      if (this.state.lastStatusByPaneKey.has(paneKey)) {
        statusChanged = true
      }
      this.clearAssistantMessageRetry(paneKey)
      clearPaneCacheState(this.state, paneKey)
      this.runtimeObservedStatusPaneKeys.delete(paneKey)
      this.promptSentDedupeByPaneKey.delete(paneKey)
    }
    if (aliasChanged) {
      this.notifyPaneKeyAliasPersistenceListener()
    }
    if (statusChanged) {
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
    }
  }

  clearPaneState(paneKey: string): void {
    const resolvedPaneKey = this.resolvePaneKeyAlias(paneKey)
    // Why: only schedule a write when we actually evicted a status entry —
    // dropping prompt/tool caches for a pane that never produced a hook
    // event does not change the on-disk file, and skipping the write avoids
    // re-stat'ing on every dead-pane teardown.
    const hadStatus = this.state.lastStatusByPaneKey.has(resolvedPaneKey)
    this.clearAssistantMessageRetry(resolvedPaneKey)
    clearPaneCacheState(this.state, resolvedPaneKey)
    this.promptSentDedupeByPaneKey.delete(resolvedPaneKey)
    let clearedAlias = false
    for (const [legacyPaneKey, stablePaneKey] of this.legacyPaneKeyAliases) {
      if (stablePaneKey.stablePaneKey === resolvedPaneKey) {
        this.legacyPaneKeyAliases.delete(legacyPaneKey)
        clearPaneCacheState(this.state, legacyPaneKey)
        this.promptSentDedupeByPaneKey.delete(legacyPaneKey)
        clearedAlias = true
      }
    }
    if (clearedAlias) {
      this.notifyPaneKeyAliasPersistenceListener()
    }
    if (hadStatus) {
      this.runtimeObservedStatusPaneKeys.delete(resolvedPaneKey)
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
      this.onPaneStatusCleared?.(resolvedPaneKey)
    }
  }

  async reapRestoredClaudeSubagentsWithoutLiveAgent(
    isLocalExecutionHost: (worktreeId: string | undefined) => boolean,
    isLocalPaneAgentLive: (paneKey: string) => Promise<boolean>,
    isLocalPaneLivenessEvidenceCurrent: (paneKey: string) => boolean
  ): Promise<number> {
    const candidates: { paneKey: string; entry: EnrichedAgentHookEventPayload }[] = []
    for (const [paneKey, entry] of this.state.lastStatusByPaneKey) {
      const enriched = entry as EnrichedAgentHookEventPayload
      if (
        enriched.payload.agentType === 'claude' &&
        enriched.connectionId === null &&
        isLocalExecutionHost(enriched.worktreeId) &&
        claudeRosterHasRestoredSnapshotSubagent(
          this.state.claudeSubagentRosterByPaneKey.get(paneKey)
        ) &&
        !this.runtimeObservedStatusPaneKeys.has(paneKey)
      ) {
        candidates.push({ paneKey, entry: enriched })
      }
    }
    const liveness = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          return await isLocalPaneAgentLive(candidate.paneKey)
        } catch {
          return true
        }
      })
    )
    let changedPanes = 0
    for (const [index, candidate] of candidates.entries()) {
      const { paneKey, entry } = candidate
      if (
        liveness[index] ||
        !isLocalPaneLivenessEvidenceCurrent(paneKey) ||
        this.state.lastStatusByPaneKey.get(paneKey) !== entry ||
        this.runtimeObservedStatusPaneKeys.has(paneKey) ||
        !isLocalExecutionHost(entry.worktreeId)
      ) {
        continue
      }
      if (!reapRestoredClaudeSubagentsForDeadPane(this.state, paneKey)) {
        continue
      }
      changedPanes += 1
      const roster = this.state.claudeSubagentRosterByPaneKey.get(paneKey)
      const state =
        entry.payload.state === 'working' && !claudeRosterHasWorkingSubagent(roster)
          ? 'done'
          : entry.payload.state
      const stateChanged = state !== entry.payload.state
      const reconciledAt = stateChanged
        ? Math.max(Date.now(), entry.receivedAt + 1)
        : entry.receivedAt
      const reconciled: EnrichedAgentHookEventPayload = {
        ...entry,
        receivedAt: reconciledAt,
        stateStartedAt: stateChanged ? reconciledAt : entry.stateStartedAt,
        payload: { ...entry.payload, state, subagents: claudeRosterToSnapshots(roster) }
      }
      this.state.lastStatusByPaneKey.set(paneKey, reconciled)
    }
    if (changedPanes > 0) {
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
    }
    return changedPanes
  }
}
