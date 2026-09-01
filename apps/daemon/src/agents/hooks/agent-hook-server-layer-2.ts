import {
  resolveAgentStatusIdentity,
  shouldSuppressInheritedTerminalStatus
} from '@yiru/runtime-protocol/workbench/agent/status-identity'
import {
  reconcileRemoteCodexState,
  type AgentHookEventPayload
} from '~main/agents/core/hook-listener'

import { track } from '../../telemetry/client'
import { getCohortAtEmit } from '../../telemetry/cohort-classifier'
import type { EnrichedAgentHookEventPayload } from './agent-hook-server-foundation'
import {
  INTERRUPTED_DONE_LATE_WORKING_SUPPRESSION_MS,
  agentTypeToPromptSentAgentKind
} from './agent-hook-server-foundation'
import { AgentHookServerLayer1 } from './agent-hook-server-layer-1'
import {
  isToolProgressWorkingAfterInterrupt,
  shouldKeepClaudePermissionVisible,
  attachClaudePermissionToolUseId
} from './agent-hook-status-normalization'

export abstract class AgentHookServerLayer2 extends AgentHookServerLayer1 {
  protected maybeTrackAgentPromptSent(
    payload: AgentHookEventPayload,
    previousStatus: EnrichedAgentHookEventPayload | undefined
  ): void {
    if (payload.isReplay === true || payload.hasExplicitPrompt !== true) {
      return
    }
    const prompt = payload.payload.prompt?.trim() ?? ''
    if (prompt.length === 0) {
      return
    }
    const agentKind = agentTypeToPromptSentAgentKind(payload.payload.agentType)
    const promptHash = this.hashPromptForTelemetryDedupe(prompt)
    const promptInteractionKey =
      typeof payload.promptInteractionKey === 'string' &&
      payload.promptInteractionKey.trim().length > 0
        ? payload.promptInteractionKey.trim()
        : undefined
    const previousDedupe = this.promptSentDedupeByPaneKey.get(payload.paneKey)
    const isCompletedTurnBoundary =
      previousStatus?.payload.state === 'done' && payload.payload.state === 'working'
    if (
      previousDedupe?.agentKind === agentKind &&
      previousDedupe.promptInteractionKey !== undefined &&
      previousDedupe.promptInteractionKey === promptInteractionKey &&
      (agentKind === 'opencode' || previousDedupe.promptHash === promptHash)
    ) {
      return
    }
    if (
      previousDedupe?.agentKind === agentKind &&
      previousDedupe.promptHash === promptHash &&
      !(
        previousStatus?.payload.state === 'done' &&
        payload.payload.state === 'done' &&
        previousDedupe.promptInteractionKey !== undefined &&
        promptInteractionKey !== undefined &&
        previousDedupe.promptInteractionKey !== promptInteractionKey
      ) &&
      !isCompletedTurnBoundary
    ) {
      return
    }
    this.promptSentDedupeByPaneKey.set(payload.paneKey, {
      agentKind,
      promptHash,
      promptInteractionKey
    })
    try {
      // Why: hooks prove the user submitted a turn, but do not know which UI
      // launched the terminal; keep attribution low-cardinality and conservative.
      track('agent_prompt_sent', {
        agent_kind: agentKind,
        launch_source: 'unknown',
        request_kind: 'followup',
        ...getCohortAtEmit()
      })
    } catch (err) {
      console.error('[agent-hooks] prompt-sent telemetry failed', err)
    }
  }

  protected applyNormalizedStatus(payload: AgentHookEventPayload): EnrichedAgentHookEventPayload {
    const previous = this.state.lastStatusByPaneKey.get(payload.paneKey) as
      | EnrichedAgentHookEventPayload
      | undefined
    const now = Date.now()
    if (payload.providerSessionOnly) {
      // Why: session_start replaces stale turn state and survives replay, but
      // must not emit prompt telemetry or a fabricated visible status.
      const enriched = this.attachStatusTiming(payload, now)
      this.clearAssistantMessageRetry(enriched.paneKey)
      this.runtimeObservedStatusPaneKeys.delete(enriched.paneKey)
      this.state.lastStatusByPaneKey.set(enriched.paneKey, enriched)
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
      this.onAgentStatus?.(enriched)
      return enriched
    }
    const sameTransportAuthority = previous?.connectionId === payload.connectionId
    if (previous && !sameTransportAuthority && payload.payload.agentType === 'codex') {
      // Why: a replacement SSH/WSL process may reuse the pane; do not merge it with the lost transport's children.
      this.state.codexSubagentRosterByPaneKey.delete(payload.paneKey)
      this.state.codexLeadStateByPaneKey.delete(payload.paneKey)
    }
    const stateReconciledPayload =
      payload.connectionId !== null &&
      payload.payload.agentType === 'codex' &&
      payload.hookEventName
        ? {
            ...payload,
            payload: reconcileRemoteCodexState(
              this.state,
              payload.paneKey,
              payload.hookEventName,
              payload.toolAgentId,
              payload.payload,
              sameTransportAuthority ? previous?.payload : undefined
            )
          }
        : payload
    const previousCodexRoot =
      stateReconciledPayload.payload.agentType === 'codex' &&
      stateReconciledPayload.toolAgentId &&
      previous?.payload.agentType === 'codex' &&
      sameTransportAuthority
        ? previous
        : undefined
    const preservedProviderSession = !stateReconciledPayload.providerSession
      ? previousCodexRoot?.providerSession
      : undefined
    const preservedRootModel = !stateReconciledPayload.payload.model
      ? previousCodexRoot?.payload.model
      : undefined
    // Why: child hooks and relay restarts omit root-only fields; keep the pane's durable resume/model identity.
    const rootContextPreservingPayload =
      preservedProviderSession || preservedRootModel
        ? {
            ...stateReconciledPayload,
            ...(preservedProviderSession ? { providerSession: preservedProviderSession } : {}),
            payload: preservedRootModel
              ? { ...stateReconciledPayload.payload, model: preservedRootModel }
              : stateReconciledPayload.payload
          }
        : stateReconciledPayload
    const identity = resolveAgentStatusIdentity({
      existing: previous
        ? {
            agentType: previous.payload.agentType,
            state: previous.payload.state,
            updatedAt: previous.receivedAt
          }
        : undefined,
      incoming: rootContextPreservingPayload.payload.agentType,
      now
    })
    if (
      previous &&
      shouldSuppressInheritedTerminalStatus({
        inheritedFromActivePane: identity.inheritedFromActivePane,
        incomingState: rootContextPreservingPayload.payload.state
      })
    ) {
      return previous
    }
    const identityResolvedPayload =
      identity.agentType === rootContextPreservingPayload.payload.agentType
        ? rootContextPreservingPayload
        : {
            ...rootContextPreservingPayload,
            payload: {
              ...rootContextPreservingPayload.payload,
              agentType: identity.agentType
            }
          }
    const effectivePayload = attachClaudePermissionToolUseId(previous, identityResolvedPayload)
    if (previous && shouldKeepClaudePermissionVisible(previous, effectivePayload)) {
      return previous
    }
    // Why: some TUIs can emit a delayed tool/working hook after Ctrl+C already
    // stopped the turn. Do not let that stale same-turn event resurrect the row.
    if (
      previous?.payload.state === 'done' &&
      previous.payload.interrupted === true &&
      effectivePayload.payload.state === 'done' &&
      previous.payload.agentType === effectivePayload.payload.agentType &&
      previous.payload.prompt === effectivePayload.payload.prompt &&
      Date.now() - previous.receivedAt <= INTERRUPTED_DONE_LATE_WORKING_SUPPRESSION_MS
    ) {
      return previous
    }
    if (
      previous?.payload.state === 'done' &&
      previous.payload.interrupted === true &&
      effectivePayload.payload.state === 'working' &&
      previous.payload.agentType === effectivePayload.payload.agentType &&
      previous.payload.prompt === effectivePayload.payload.prompt &&
      (effectivePayload.isReplay === true ||
        isToolProgressWorkingAfterInterrupt(effectivePayload) ||
        (effectivePayload.hasExplicitPrompt !== true &&
          Date.now() - previous.receivedAt <= INTERRUPTED_DONE_LATE_WORKING_SUPPRESSION_MS))
    ) {
      return previous
    }
    if (
      effectivePayload.payload.state !== 'done' ||
      effectivePayload.payload.lastAssistantMessage
    ) {
      this.clearAssistantMessageRetry(effectivePayload.paneKey)
    }
    if (!identity.inheritedFromActivePane) {
      this.maybeTrackAgentPromptSent(effectivePayload, previous)
    }
    const enriched = this.attachStatusTiming(effectivePayload, now)
    this.runtimeObservedStatusPaneKeys.add(enriched.paneKey)
    this.state.lastStatusByPaneKey.set(enriched.paneKey, enriched)
    this.scheduleStatusPersist()
    this.notifyStatusChangeListeners()
    this.onAgentStatus?.(enriched)
    return enriched
  }

  protected clearAssistantMessageRetry(paneKey: string): void {
    const timer = this.assistantMessageRetryTimers.get(paneKey)
    if (!timer) {
      return
    }
    clearTimeout(timer)
    this.assistantMessageRetryTimers.delete(paneKey)
  }
}
