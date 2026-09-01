import { createHash } from 'node:crypto'

import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusIpcPayload,
  type AgentType
} from '@yiru/runtime-protocol/model/agent'
import {
  isAgentInterruptInputIntent,
  type AgentInterruptInferenceRequest
} from '@yiru/runtime-protocol/workbench/agent/interrupt-intent'
import { isCommandCodeNewTurnWhileWorking } from '@yiru/runtime-protocol/workbench/command-code-turn-boundary'
import { parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import {
  markClaudeLeadTurnInterrupted,
  markCodexLeadTurnInterrupted,
  type AgentHookEventPayload
} from '~main/agents/core/hook-listener'

import { AgentHookServerContract } from './agent-hook-server-contract'
import type {
  EnrichedAgentHookEventPayload,
  AgentHookStatusChangeEntry,
  StatusChangeListener,
  PaneStatusClearListener
} from './agent-hook-server-foundation'
import {
  CLOSED_AGENT_STATUS_TAB_IDS_MAX,
  CLOSED_AGENT_STATUS_PANE_KEYS_MAX,
  equivalentInterruptAgentType,
  isValidPaneKey
} from './agent-hook-server-foundation'
import { toAgentStatusIpcPayload } from './agent-hook-status-normalization'

export abstract class AgentHookServerLayer1 extends AgentHookServerContract {
  initializeForwardedHost(options: {
    env: string
    userDataPath: string
    endpointNamespace?: string
  }): void {
    this.configureHostState(options)
  }

  setForwardedPtyEnv(env: Record<string, string>): void {
    this.forwardedPtyEnv = { ...env }
  }

  setListener(listener: ((payload: EnrichedAgentHookEventPayload) => void) | null): void {
    this.onAgentStatus = listener
    if (!listener) {
      return
    }
    // Why: replay is best-effort per pane so one throwing listener call can't
    // starve subsequent panes from being replayed.
    for (const payload of this.state.lastStatusByPaneKey.values()) {
      try {
        // Why: cache values are stored as enriched payloads (with receivedAt /
        // stateStartedAt). The map's declared element type from the shared
        // listener is the bare AgentHookEventPayload because the shared module
        // never reads from this map; only this class does, and only enriched
        // values are ever inserted.
        listener({ ...(payload as EnrichedAgentHookEventPayload), isReplay: true })
      } catch (err) {
        console.error('[agent-hooks] replay listener threw', err)
      }
    }
  }

  subscribeStatusChanges(listener: StatusChangeListener): () => void {
    this.statusChangeListeners.add(listener)
    return () => {
      this.statusChangeListeners.delete(listener)
    }
  }

  setPaneStatusClearListener(listener: PaneStatusClearListener | null): void {
    this.onPaneStatusCleared = listener
  }

  /** Snapshot of the current cached statuses, in the IPC-shaped form the
   *  renderer consumes. Used by the `agentStatus.getSnapshot` procedure after
   *  workspace tabs have hydrated, so the dashboard catches up on any
   *  hook events that fired during startup. */
  getStatusSnapshot(): AgentStatusIpcPayload[] {
    return Array.from(this.state.lastStatusByPaneKey.values(), (entry) =>
      toAgentStatusIpcPayload(entry as EnrichedAgentHookEventPayload)
    )
  }

  inferInterrupt(request: AgentInterruptInferenceRequest): boolean {
    if (!isValidPaneKey(request.paneKey)) {
      return false
    }
    if (!isAgentInterruptInputIntent(request.intent)) {
      return false
    }
    const existing = this.state.lastStatusByPaneKey.get(request.paneKey) as
      | EnrichedAgentHookEventPayload
      | undefined
    if (!existing) {
      return false
    }
    if (existing.providerSessionOnly) {
      return false
    }
    const payload = existing.payload
    const agentType: AgentType | undefined = payload.agentType
    // Why: Droid's Ctrl+C does not interrupt the current turn; repeated Ctrl+C
    // exits the CLI, which is handled by process/PTY lifecycle cleanup.
    if (agentType === 'droid' && request.intent === 'ctrl-c') {
      return false
    }
    // Why: these agents use the first Escape as a TUI/editor cancel. A single
    // Escape can leave the turn running, so only a deliberate double Escape
    // may infer an interrupted turn.
    if (
      (agentType === 'opencode' || agentType === 'copilot') &&
      request.intent === 'plain-escape' &&
      request.inputCount !== 2
    ) {
      return false
    }
    // Why: input-intent inference is a fallback for a missing final hook. A strict
    // baseline match keeps a delayed timer from overwriting any newer hook,
    // including same-millisecond prompt or agent identity changes.
    if (
      payload.state !== 'working' ||
      !equivalentInterruptAgentType(agentType, request.baselineAgentType) ||
      payload.prompt !== request.baselinePrompt ||
      existing.receivedAt !== request.baselineUpdatedAt ||
      existing.stateStartedAt !== request.baselineStateStartedAt ||
      Date.now() - existing.receivedAt > AGENT_STATUS_STALE_AFTER_MS
    ) {
      return false
    }
    // Why: a 'working' pane can be child-driven (lead already idle, background
    // subagent running). Ctrl+C at the TUI does not stop background children,
    // so inferring a terminal done here would wrongly retire live child rows;
    // their own hook events keep the row truthful instead.
    if (payload.subagents?.some((subagent) => subagent.state !== 'idle')) {
      return false
    }

    // Why: keep the listener's Claude lead-turn record in sync — a later
    // child lifecycle event would otherwise re-emit the stale pre-interrupt
    // 'working' lead state and resurrect the cancelled pane.
    if (agentType === 'claude') {
      markClaudeLeadTurnInterrupted(this.state, existing.paneKey)
    }
    if (agentType === 'codex') {
      markCodexLeadTurnInterrupted(this.state, existing.paneKey)
    }
    const inferred = this.applyNormalizedStatus({
      paneKey: existing.paneKey,
      tabId: existing.tabId,
      worktreeId: existing.worktreeId,
      connectionId: existing.connectionId,
      providerSession: existing.providerSession,
      payload: {
        state: 'done',
        prompt: payload.prompt,
        agentType,
        ...(payload.model ? { model: payload.model } : {}),
        interrupted: true,
        // Why: idle children are display state; dropping them on an inferred
        // interrupt would blank the child rows a later hook would restore.
        ...(payload.subagents ? { subagents: payload.subagents } : {})
      }
    })
    console.debug('[agent-hooks] inferred interrupted agent status', {
      paneKey: inferred.paneKey,
      agentType,
      intent: request.intent
    })
    return true
  }

  getStatusChangeSnapshot(): AgentHookStatusChangeEntry[] {
    return Array.from(this.state.lastStatusByPaneKey.entries()).flatMap(([paneKey, entry]) => {
      const enriched = entry as EnrichedAgentHookEventPayload
      return enriched.providerSessionOnly
        ? []
        : [
            {
              state: enriched.payload.state,
              receivedAt: enriched.receivedAt,
              observedInCurrentRuntime: this.runtimeObservedStatusPaneKeys.has(paneKey)
            }
          ]
    })
  }

  protected notifyStatusChangeListeners(): void {
    if (this.statusChangeListeners.size === 0) {
      return
    }
    const snapshot = this.getStatusChangeSnapshot()
    for (const listener of this.statusChangeListeners) {
      try {
        listener(snapshot)
      } catch (err) {
        console.error('[agent-hooks] status-change listener threw', err)
      }
    }
  }

  protected markTabClosedForAgentStatus(tabId: string): void {
    // Delete-then-add keeps recently closed tabs most-recent so eviction only
    // sheds the oldest ids, which can no longer receive status events.
    this.closedAgentStatusTabIds.delete(tabId)
    this.closedAgentStatusTabIds.add(tabId)
    while (this.closedAgentStatusTabIds.size > CLOSED_AGENT_STATUS_TAB_IDS_MAX) {
      const oldest = this.closedAgentStatusTabIds.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.closedAgentStatusTabIds.delete(oldest)
    }
  }

  protected shouldSuppressClosedTabStatus(paneKey: string): boolean {
    const ownerPaneKey = this.resolvePaneKeyAlias(paneKey)
    if (
      this.closedAgentStatusPaneKeys.has(paneKey) ||
      this.closedAgentStatusPaneKeys.has(ownerPaneKey)
    ) {
      return true
    }
    const tabId = parsePaneKey(ownerPaneKey)?.tabId
    if (!tabId) {
      return false
    }
    return this.closedAgentStatusTabIds.has(tabId)
  }

  protected markPaneClosedForAgentStatus(paneKey: string): void {
    this.closedAgentStatusPaneKeys.delete(paneKey)
    this.closedAgentStatusPaneKeys.add(paneKey)
    while (this.closedAgentStatusPaneKeys.size > CLOSED_AGENT_STATUS_PANE_KEYS_MAX) {
      const oldest = this.closedAgentStatusPaneKeys.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.closedAgentStatusPaneKeys.delete(oldest)
    }
  }

  protected attachStatusTiming(
    payload: AgentHookEventPayload,
    now = Date.now()
  ): EnrichedAgentHookEventPayload {
    const previous = this.state.lastStatusByPaneKey.get(payload.paneKey) as
      | EnrichedAgentHookEventPayload
      | undefined
    const commandCodeNewTurn =
      previous !== undefined &&
      isCommandCodeNewTurnWhileWorking({
        agentType: payload.payload.agentType,
        previousState: previous.payload.state,
        incomingState: payload.payload.state,
        previousPrompt: previous.payload.prompt,
        incomingPrompt: payload.payload.prompt,
        hasExplicitPrompt: payload.hasExplicitPrompt,
        previousPromptInteractionKey: previous.promptInteractionKey,
        incomingPromptInteractionKey: payload.promptInteractionKey
      })
    const stateStartedAt =
      previous && previous.payload.state === payload.payload.state && !commandCodeNewTurn
        ? previous.stateStartedAt
        : now
    return {
      ...payload,
      receivedAt: now,
      stateStartedAt
    }
  }

  protected hashPromptForTelemetryDedupe(prompt: string): string {
    return createHash('sha256')
      .update(this.promptSentHashSalt)
      .update('\0')
      .update(prompt)
      .digest('hex')
  }
}
