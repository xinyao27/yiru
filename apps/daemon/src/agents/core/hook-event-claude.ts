import {
  normalizeAgentStatusPayload,
  type AgentStatusState,
  type ParsedAgentStatusPayload
} from '@yiru/runtime-protocol/model/agent'

import {
  claudeRosterHasWorkingSubagent,
  claudeRosterToSnapshots,
  foldClaudeBackgroundTasksIntoRoster,
  readClaudeBackgroundAgentTasks,
  upsertWorkingClaudeSubagent
} from '../../claude-subagent-roster'
import {
  getOrCreateClaudeSubagentRoster,
  normalizeClaudeSubagentLifecycleEvent,
  buildClaudeChildDrivenStatusPayload
} from './hook-event-claude-roster'
import { isNewTurnEvent, extractToolFields } from './hook-event-foundation'
import type { HookListenerState } from './hook-listener-state'
import { readString, isAskUserQuestionTool } from './hook-tool-preview'
import { resolvePrompt, resolveToolState } from './hook-tool-state'

export function normalizeClaudeEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  if (
    eventName === 'SubagentStart' ||
    eventName === 'SubagentStop' ||
    eventName === 'TeammateIdle'
  ) {
    return normalizeClaudeSubagentLifecycleEvent(state, eventName, paneKey, hookPayload)
  }

  // Why: Claude's AskUserQuestion tool is auto-allowed, so it emits PreToolUse
  // (not PermissionRequest) while blocked on a human answer — Claude posts a
  // Notification instead of PermissionRequest, and Yiru does not register the
  // Notification hook. Treat that PreToolUse as waiting so the sidebar shows the
  // amber attention state instead of a working spinner that decays to grey while
  // the question sits unanswered. Mirrors normalizeKimiEvent's handling.
  const isAskUserQuestion =
    eventName === 'PreToolUse' && isAskUserQuestionTool(readString(hookPayload, 'tool_name'))
  const stateName =
    eventName === 'UserPromptSubmit' ||
    eventName === 'PostToolUse' ||
    eventName === 'PostToolUseFailure' ||
    (eventName === 'PreToolUse' && !isAskUserQuestion)
      ? 'working'
      : eventName === 'PermissionRequest' || isAskUserQuestion
        ? 'waiting'
        : eventName === 'Stop' || eventName === 'StopFailure'
          ? 'done'
          : null

  if (!stateName) {
    return null
  }

  const eventAgentId = readString(hookPayload, 'agent_id')
  // Why: hook events originating inside a subagent/teammate carry `agent_id`;
  // the lead session's own events don't. Subagent tool activity keeps that
  // child's row live but must not be mistaken for the lead's turn state, and
  // must not overwrite the lead's tool/prompt caches (a live AskUserQuestion
  // card would vanish when a background child ran its next tool). Two
  // exceptions take the full path below: waiting-inducing events (a child's
  // PermissionRequest/AskUserQuestion needs the human's attention on this
  // pane), and the blocked child's own next tool event (approval granted —
  // the wait must clear exactly as it does for the lead).
  const isWaitingInducing = stateName === 'waiting'
  const subagentOriginId =
    !isWaitingInducing &&
    (eventName === 'PreToolUse' ||
      eventName === 'PostToolUse' ||
      eventName === 'PostToolUseFailure')
      ? eventAgentId
      : undefined
  if (eventAgentId && (subagentOriginId || isWaitingInducing)) {
    upsertWorkingClaudeSubagent(
      getOrCreateClaudeSubagentRoster(state, paneKey),
      eventAgentId,
      { agentType: readString(hookPayload, 'agent_type') },
      Date.now()
    )
  }
  if (subagentOriginId) {
    const lead = state.claudeLeadStateByPaneKey.get(paneKey)
    if (lead?.state !== 'waiting' || lead.waitingAgentId !== subagentOriginId) {
      return buildClaudeChildDrivenStatusPayload(state, eventName, paneKey, hookPayload)
    }
    // Why: approval granted — update the tool snapshot exactly as the lead's
    // own next tool event would (dropping the pending card), but restore the
    // lead state the wait displaced instead of adopting this child event as
    // the lead's 'working': the lead may already be done, and the done-gate
    // never upgrades working back to done once the roster drains.
    const restored = lead.stateBeforeWait ?? { state: 'working' as const }
    state.claudeLeadStateByPaneKey.set(paneKey, restored)
    const roster = state.claudeSubagentRosterByPaneKey.get(paneKey)
    return buildClaudeStatusPayload(state, eventName, promptText, paneKey, hookPayload, {
      stateName:
        restored.state === 'done' && claudeRosterHasWorkingSubagent(roster)
          ? 'working'
          : restored.state,
      updateToolSnapshot: true,
      interrupted: restored.interrupted
    })
  }

  // Why: lead events never carry agent_id, so a known child's id on a
  // turn-boundary event (a CLI that stops converting child Stops to
  // SubagentStop) must not retire or resurrect the pane as if the lead
  // spoke — re-emit it as child activity instead.
  if (
    eventAgentId &&
    !isWaitingInducing &&
    state.claudeSubagentRosterByPaneKey.get(paneKey)?.has(eventAgentId)
  ) {
    return buildClaudeChildDrivenStatusPayload(state, eventName, paneKey, hookPayload)
  }

  if (eventName === 'Stop' || eventName === 'StopFailure') {
    // Why: background_tasks is only trusted where unambiguous (empty list,
    // id-exact matches, unmatched running one-shot subagents) — see
    // foldClaudeBackgroundTasksIntoRoster. The lifecycle events own teammate
    // state; teammates report "running" here even while idle. Older Claude
    // builds without the field keep the incrementally tracked roster.
    const backgroundTasks = readClaudeBackgroundAgentTasks(hookPayload)
    if (backgroundTasks.present) {
      foldClaudeBackgroundTasksIntoRoster(
        getOrCreateClaudeSubagentRoster(state, paneKey),
        backgroundTasks.tasks,
        Date.now(),
        { inventoryComplete: !backgroundTasks.truncated }
      )
    }
  }
  const interrupted =
    eventName === 'Stop' && hookPayload['is_interrupt'] === true ? true : undefined
  // Why: a child-induced wait displaces the lead's own state; stash it so
  // clearing the wait restores reality (the lead may already be done). A
  // second child wait carries the ORIGINAL stash forward, not the
  // intermediate waiting state.
  const previousLead = state.claudeLeadStateByPaneKey.get(paneKey)
  const stateBeforeWait =
    isWaitingInducing && eventAgentId && previousLead
      ? previousLead.state === 'waiting'
        ? previousLead.stateBeforeWait
        : {
            state: previousLead.state,
            ...(previousLead.interrupted ? { interrupted: true as const } : {})
          }
      : undefined
  state.claudeLeadStateByPaneKey.set(paneKey, {
    state: stateName,
    ...(interrupted ? { interrupted } : {}),
    ...(isWaitingInducing && eventAgentId ? { waitingAgentId: eventAgentId } : {}),
    ...(stateBeforeWait ? { stateBeforeWait } : {})
  })

  // Why: the lead ending its turn is not "done" while spawned subagents or
  // teammates are still running — that reads as a finished ✅ in the sidebar
  // while a background review loop is mid-flight. Claude wakes the lead when
  // a child finishes, so a later Stop with an empty roster resolves to done.
  const roster = state.claudeSubagentRosterByPaneKey.get(paneKey)
  const effectiveState =
    stateName === 'done' && claudeRosterHasWorkingSubagent(roster) ? 'working' : stateName

  return buildClaudeStatusPayload(state, eventName, promptText, paneKey, hookPayload, {
    stateName: effectiveState,
    updateToolSnapshot: true,
    interrupted
  })
}

export function buildClaudeStatusPayload(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>,
  options: { stateName: AgentStatusState; updateToolSnapshot: boolean; interrupted?: boolean }
): ParsedAgentStatusPayload | null {
  // Why: child-driven refreshes are roster bookkeeping, not lead tool
  // activity. Read the cached tool snapshot without merging so they can't
  // clear a live AskUserQuestion card or clobber the in-flight tool preview.
  const snapshot = options.updateToolSnapshot
    ? resolveToolState(state, paneKey, extractToolFields('claude', eventName, hookPayload), {
        resetOnNewTurn: isNewTurnEvent('claude', eventName)
      })
    : (state.lastToolByPaneKey.get(paneKey) ?? {})

  // Why: normalizeAgentStatusPayload validates the object directly — the
  // JSON stringify/parse round trip the other normalizers use is pure
  // overhead on this hot per-hook-event path. The normalizer clamps
  // `interrupted` to done-state payloads, so a gated 'working' emit drops it
  // while claudeLeadStateByPaneKey preserves it for the eventual done.
  return normalizeAgentStatusPayload({
    state: options.stateName,
    // Why: only lead-origin events (updateToolSnapshot) may reset the prompt
    // cache; a child-driven refresh must not blank the lead's prompt label.
    prompt: resolvePrompt(state, paneKey, promptText, {
      resetOnNewTurn: options.updateToolSnapshot && isNewTurnEvent('claude', eventName)
    }),
    agentType: 'claude',
    toolName: snapshot.toolName,
    toolInput: snapshot.toolInput,
    interactivePrompt: snapshot.interactivePrompt,
    lastAssistantMessage: snapshot.lastAssistantMessage,
    interrupted: options.interrupted,
    subagents: claudeRosterToSnapshots(state.claudeSubagentRosterByPaneKey.get(paneKey))
  })
}

// Why: Devin uses Claude-compatible hook payload shapes but has its own
// documented lifecycle event set. Keep attribution as Devin while normalizing
// those event names into Yiru's shared status states.
