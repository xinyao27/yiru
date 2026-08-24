import {
  AGENT_MODEL_MAX_LENGTH,
  normalizeAgentStatusPayload,
  normalizeOptionalField,
  type ParsedAgentStatusPayload
} from '@yiru/workbench-model/agent'

import {
  codexRosterEffectiveState,
  codexRosterToSnapshots,
  finishCodexSubagent,
  seedCodexSubagentRoster,
  upsertCodexSubagent,
  type CodexSubagentRoster
} from '../codex-subagent-roster'
import { isNewTurnEvent, extractToolFields } from './hook-event-foundation'
import type { HookListenerState, CodexLeadTurnState } from './hook-listener-state'
import { readString } from './hook-tool-preview'
import { resolvePrompt, resolveToolState } from './hook-tool-state'

export function getOrCreateCodexSubagentRoster(
  state: HookListenerState,
  paneKey: string
): CodexSubagentRoster {
  let roster = state.codexSubagentRosterByPaneKey.get(paneKey)
  if (!roster) {
    roster = new Map()
    state.codexSubagentRosterByPaneKey.set(paneKey, roster)
  }
  return roster
}

export function seedCodexStateFromSnapshot(
  state: HookListenerState,
  paneKey: string,
  payload: Pick<ParsedAgentStatusPayload, 'model' | 'state' | 'subagents'>
): void {
  const snapshots = payload.subagents ?? []
  if (snapshots.length > 0 && !state.codexSubagentRosterByPaneKey.has(paneKey)) {
    seedCodexSubagentRoster(getOrCreateCodexSubagentRoster(state, paneKey), snapshots)
  }
  if (!state.codexLeadStateByPaneKey.has(paneKey)) {
    // Why: child hooks after restart omit the root model; seed it from durable status before they can overwrite the cache.
    state.codexLeadStateByPaneKey.set(paneKey, {
      // Why: a child wait drives aggregate waiting, so it is not evidence that the root itself was waiting.
      state:
        payload.state === 'done'
          ? 'done'
          : payload.state === 'waiting' &&
              !snapshots.some((snapshot) => snapshot.state === 'waiting')
            ? 'waiting'
            : 'working',
      model: payload.model
    })
  }
}

/** Sync the Codex lead when Yiru infers an interrupt so delayed child events cannot revive it. */
export function markCodexLeadTurnInterrupted(state: HookListenerState, paneKey: string): void {
  const lead = state.codexLeadStateByPaneKey.get(paneKey)
  state.codexLeadStateByPaneKey.set(paneKey, { state: 'done', model: lead?.model })
}

export function codexLeadStateForHookEvent(
  eventName: string | undefined
): CodexLeadTurnState['state'] | undefined {
  if (eventName === 'Stop') {
    return 'done'
  }
  if (eventName === 'PermissionRequest') {
    return 'waiting'
  }
  if (
    eventName === 'SessionStart' ||
    eventName === 'UserPromptSubmit' ||
    eventName === 'PreToolUse' ||
    eventName === 'PostToolUse'
  ) {
    return 'working'
  }
  return undefined
}

/** Why: relay restarts lose lead/roster state; merge child events into main's longer-lived cache. */
export function reconcileRemoteCodexState(
  state: HookListenerState,
  paneKey: string,
  eventName: string | undefined,
  agentId: string | undefined,
  payload: ParsedAgentStatusPayload,
  previous: ParsedAgentStatusPayload | undefined
): ParsedAgentStatusPayload {
  if (previous?.agentType === 'codex') {
    seedCodexStateFromSnapshot(state, paneKey, previous)
  } else {
    seedCodexStateFromSnapshot(state, paneKey, payload)
  }

  // Why: older relays send child identity without roster snapshots; keep their normalized aggregate authoritative.
  if (agentId && !payload.subagents && !state.codexSubagentRosterByPaneKey.has(paneKey)) {
    return payload
  }
  const roster = getOrCreateCodexSubagentRoster(state, paneKey)
  if (payload.subagents) {
    seedCodexSubagentRoster(roster, payload.subagents)
  }
  if (agentId) {
    if (eventName === 'SubagentStop') {
      finishCodexSubagent(roster, agentId)
    }
  } else {
    const leadState = codexLeadStateForHookEvent(eventName)
    if (eventName === 'SessionStart' || eventName === 'Stop') {
      roster.clear()
    }
    if (leadState) {
      const previousLead = state.codexLeadStateByPaneKey.get(paneKey)
      state.codexLeadStateByPaneKey.set(paneKey, {
        state: leadState,
        model: payload.model ?? previousLead?.model
      })
    }
  }

  const lead = state.codexLeadStateByPaneKey.get(paneKey)
  if (!lead) {
    return payload
  }
  return {
    ...payload,
    state: codexRosterEffectiveState(roster, lead.state),
    model: lead.model ?? payload.model,
    subagents: codexRosterToSnapshots(roster)
  }
}

export function buildCodexStatusPayload(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>,
  options: { stateName: 'working' | 'waiting' | 'done'; updateLead: boolean }
): ParsedAgentStatusPayload | null {
  const snapshot = options.updateLead
    ? resolveToolState(state, paneKey, extractToolFields('codex', eventName, hookPayload), {
        resetOnNewTurn: isNewTurnEvent('codex', eventName)
      })
    : (state.lastToolByPaneKey.get(paneKey) ?? {})
  const lead = state.codexLeadStateByPaneKey.get(paneKey)

  return normalizeAgentStatusPayload({
    state: options.stateName,
    prompt: resolvePrompt(state, paneKey, promptText, {
      resetOnNewTurn: options.updateLead && isNewTurnEvent('codex', eventName)
    }),
    agentType: 'codex',
    model: lead?.model,
    toolName: snapshot.toolName,
    toolInput: snapshot.toolInput,
    interactivePrompt: snapshot.interactivePrompt,
    lastAssistantMessage: snapshot.lastAssistantMessage,
    subagents: codexRosterToSnapshots(state.codexSubagentRosterByPaneKey.get(paneKey))
  })
}

export function buildCodexChildDrivenStatusPayload(
  state: HookListenerState,
  eventName: unknown,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const leadState = state.codexLeadStateByPaneKey.get(paneKey)?.state ?? 'working'
  const stateName = codexRosterEffectiveState(
    state.codexSubagentRosterByPaneKey.get(paneKey),
    leadState
  )
  return buildCodexStatusPayload(state, eventName, '', paneKey, hookPayload, {
    stateName,
    updateLead: false
  })
}

export function normalizeCodexSubagentLifecycleEvent(
  state: HookListenerState,
  eventName: 'SubagentStart' | 'SubagentStop',
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const agentId = readString(hookPayload, 'agent_id')
  if (!agentId) {
    return null
  }
  const roster = getOrCreateCodexSubagentRoster(state, paneKey)
  if (eventName === 'SubagentStart') {
    upsertCodexSubagent(
      roster,
      agentId,
      {
        agentType: readString(hookPayload, 'agent_type'),
        model: readString(hookPayload, 'model'),
        state: 'working'
      },
      Date.now()
    )
  } else {
    finishCodexSubagent(roster, agentId)
  }
  return buildCodexChildDrivenStatusPayload(state, eventName, paneKey, hookPayload)
}

export function normalizeCodexEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  if (eventName === 'SubagentStart' || eventName === 'SubagentStop') {
    return normalizeCodexSubagentLifecycleEvent(state, eventName, paneKey, hookPayload)
  }

  const stateName =
    eventName === 'SessionStart' ||
    eventName === 'UserPromptSubmit' ||
    eventName === 'PreToolUse' ||
    eventName === 'PostToolUse'
      ? 'working'
      : eventName === 'PermissionRequest'
        ? 'waiting'
        : eventName === 'Stop'
          ? 'done'
          : null

  if (!stateName) {
    return null
  }

  const agentId = readString(hookPayload, 'agent_id')
  if (agentId) {
    upsertCodexSubagent(
      getOrCreateCodexSubagentRoster(state, paneKey),
      agentId,
      {
        agentType: readString(hookPayload, 'agent_type'),
        model: readString(hookPayload, 'model'),
        state: stateName === 'waiting' ? 'waiting' : 'working'
      },
      Date.now()
    )
    return buildCodexChildDrivenStatusPayload(state, eventName, paneKey, hookPayload)
  }

  if (eventName === 'SessionStart' || eventName === 'Stop') {
    // Why: a pane can host a fresh process, and Codex may omit child Stop hooks when its root stops.
    state.codexSubagentRosterByPaneKey.delete(paneKey)
  }
  const previousLead = state.codexLeadStateByPaneKey.get(paneKey)
  state.codexLeadStateByPaneKey.set(paneKey, {
    state: stateName,
    model:
      normalizeOptionalField(hookPayload.model, AGENT_MODEL_MAX_LENGTH) ??
      (eventName === 'SessionStart' ? undefined : previousLead?.model)
  })
  const effectiveState = codexRosterEffectiveState(
    state.codexSubagentRosterByPaneKey.get(paneKey),
    stateName
  )
  return buildCodexStatusPayload(state, eventName, promptText, paneKey, hookPayload, {
    stateName: effectiveState,
    updateLead: true
  })
}
