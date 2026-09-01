import type {
  AgentSubagentSnapshot,
  ParsedAgentStatusPayload
} from '@yiru/runtime-protocol/model/agent'

import {
  claudeRosterHasWorkingSubagent,
  claudeTeammateIdMatchesName,
  finishClaudeSubagent,
  reapRestoredClaudeSubagentsWithoutLiveAgent,
  removeClaudeTeammateByName,
  upsertWorkingClaudeSubagent,
  type ClaudeSubagentRoster
} from '../../claude-subagent-roster'
import { buildClaudeStatusPayload } from './hook-event-claude'
import type { HookListenerState } from './hook-listener-state'
import { readString } from './hook-tool-preview'

export function getOrCreateClaudeSubagentRoster(
  state: HookListenerState,
  paneKey: string
): ClaudeSubagentRoster {
  let roster = state.claudeSubagentRosterByPaneKey.get(paneKey)
  if (!roster) {
    roster = new Map()
    state.claudeSubagentRosterByPaneKey.set(paneKey, roster)
  }
  return roster
}

/** SubagentStart/SubagentStop/TeammateIdle don't map to a pane state by
 *  themselves; they update the roster and re-emit the lead's last known state
 *  with the fresh child list so the sidebar reflects spawn/finish immediately
 *  (a background child can outlive the lead turn by minutes with no other
 *  hook traffic). */
export function normalizeClaudeSubagentLifecycleEvent(
  state: HookListenerState,
  eventName: 'SubagentStart' | 'SubagentStop' | 'TeammateIdle',
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const roster = getOrCreateClaudeSubagentRoster(state, paneKey)
  if (eventName === 'TeammateIdle') {
    const teammateName = readString(hookPayload, 'teammate_name')
    if (!teammateName) {
      return null
    }
    // Why: idle means not working, and only working children keep a row. This
    // is the fallback finish signal for a named agent whose SubagentStop was
    // lost — its background_tasks entry never stops reading "running".
    removeClaudeTeammateByName(roster, teammateName)
    clearClaudePendingWaitForAgent(state, paneKey, (waitingAgentId) =>
      claudeTeammateIdMatchesName(waitingAgentId, teammateName)
    )
  } else {
    const agentId = readString(hookPayload, 'agent_id')
    if (!agentId) {
      return null
    }
    if (eventName === 'SubagentStart') {
      upsertWorkingClaudeSubagent(
        roster,
        agentId,
        { agentType: readString(hookPayload, 'agent_type') },
        Date.now()
      )
    } else {
      // Why: a finished child (one-shot, workflow lane, or named teammate)
      // leaves the sidebar at once. SubagentStop is the reliable finish
      // signal even for teammate-shaped ids — their background_tasks entries
      // stay "running" forever — and a resumed teammate re-earns its row.
      finishClaudeSubagent(roster, agentId)
      // Why: a blocked child that dies (killed, errored) without another tool
      // event would otherwise pin its permission/question wait on the pane
      // forever — nothing else references that agent again.
      clearClaudePendingWaitForAgent(state, paneKey, (waitingAgentId) => waitingAgentId === agentId)
    }
  }
  return buildClaudeChildDrivenStatusPayload(state, eventName, paneKey, hookPayload)
}

/** Sync the Claude lead-turn record when the SERVER infers an interrupt
 *  outside the hook stream (Ctrl+C with a missed Stop hook). Without this, a
 *  later child lifecycle event would re-emit the stale pre-interrupt lead
 *  state and resurrect a cancelled pane. */
export function markClaudeLeadTurnInterrupted(state: HookListenerState, paneKey: string): void {
  state.claudeLeadStateByPaneKey.set(paneKey, { state: 'done', interrupted: true })
}

/** Rebuild a pane's working roster from a persisted status snapshot. Live
 *  activity confirms a seed after restart; a complete task inventory may reap
 *  an unconfirmed seed whose finish hook arrived while Yiru was offline. */
export function seedClaudeSubagentRosterFromSnapshots(
  state: HookListenerState,
  paneKey: string,
  snapshots: readonly AgentSubagentSnapshot[]
): void {
  if (snapshots.length === 0 || state.claudeSubagentRosterByPaneKey.has(paneKey)) {
    return
  }
  const roster = getOrCreateClaudeSubagentRoster(state, paneKey)
  for (const snapshot of snapshots) {
    // Why: the roster only tracks working children now. A persisted idle
    // snapshot (from a build that kept idle rows) is a finished child — drop
    // it so restart doesn't resurrect the stale pile this fix removes.
    if (snapshot.state !== 'working') {
      continue
    }
    roster.set(snapshot.id, {
      startedAt: snapshot.startedAt,
      agentType: snapshot.agentType,
      description: snapshot.description,
      // Why: the seed can be a phantom (child finished while Yiru was down,
      // its SubagentStop lost). Let a PRESENT background_tasks list that
      // omits the id remove it instead of gating the pane 'working' forever.
      backgroundTasksAuthoritative: true,
      restoredFromSnapshot: true
    })
  }
}

export function reapRestoredClaudeSubagentsForDeadPane(
  state: HookListenerState,
  paneKey: string
): boolean {
  const roster = state.claudeSubagentRosterByPaneKey.get(paneKey)
  if (!roster || !reapRestoredClaudeSubagentsWithoutLiveAgent(roster)) {
    return false
  }
  if (roster.size === 0) {
    state.claudeSubagentRosterByPaneKey.delete(paneKey)
  }
  return true
}

/** Drop a child-owned waiting state when that child stops/idles, restoring
 *  the lead state the wait displaced. Without a stash (the wait was the
 *  pane's first observed lead event) fall back to 'working' and let the next
 *  lead event resolve it — a transient spinner beats a permanently stuck
 *  card. */
export function clearClaudePendingWaitForAgent(
  state: HookListenerState,
  paneKey: string,
  ownsWait: (waitingAgentId: string) => boolean
): void {
  const lead = state.claudeLeadStateByPaneKey.get(paneKey)
  if (lead?.state !== 'waiting' || !lead.waitingAgentId || !ownsWait(lead.waitingAgentId)) {
    return
  }
  state.claudeLeadStateByPaneKey.set(paneKey, lead.stateBeforeWait ?? { state: 'working' })
}

/** Emit a pane status refresh driven by child activity (lifecycle events and
 *  child-origin tool events): the lead's cached state is re-emitted — gated up
 *  to 'working' while a child works — without touching the lead's tool/prompt
 *  caches, so a live AskUserQuestion card or permission wait survives child
 *  churn. */
export function buildClaudeChildDrivenStatusPayload(
  state: HookListenerState,
  eventName: unknown,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  // Why: default 'working' — a spawn is proof of activity even before the
  // lead's first state-bearing event (e.g. Yiru restarted mid-session).
  const lead = state.claudeLeadStateByPaneKey.get(paneKey)
  const leadState = lead?.state ?? 'working'
  const roster = state.claudeSubagentRosterByPaneKey.get(paneKey)
  return buildClaudeStatusPayload(state, eventName, '', paneKey, hookPayload, {
    stateName:
      leadState === 'done' && claudeRosterHasWorkingSubagent(roster) ? 'working' : leadState,
    updateToolSnapshot: false,
    interrupted: lead?.interrupted
  })
}
