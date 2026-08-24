import { parseAgentStatusPayload, type ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'

import { isNewTurnEvent, extractToolFields } from './hook-event-foundation'
import type { HookListenerState } from './hook-listener-state'
import { clearPaneTurnCacheState } from './hook-listener-state'
import {
  normalizeCopilotEventName,
  resolveCopilotEventName,
  isAskUserTool
} from './hook-tool-copilot'
import {
  isDroidPermissionNotification,
  isDroidIdleNotification,
  isDroidAskUserTool,
  isDroidHighRiskToolUse
} from './hook-tool-droid'
import { readString, readFirstString } from './hook-tool-preview'
import { resolvePrompt, resolveToolState } from './hook-tool-state'

export function normalizeCopilotEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const normalizedEventName = normalizeCopilotEventName(
    resolveCopilotEventName(eventName, hookPayload)
  )
  const notificationType = readFirstString(hookPayload, ['notification_type', 'notificationType'])
  const isBlockingNotification =
    normalizedEventName === 'Notification' &&
    (notificationType === 'permission_prompt' || notificationType === 'elicitation_dialog')
  const toolSnapshot = extractToolFields('copilot', normalizedEventName, hookPayload)
  const isAskUserPrompt =
    (normalizedEventName === 'PreToolUse' || normalizedEventName === 'PermissionRequest') &&
    isAskUserTool(toolSnapshot.toolName)
  const stateName =
    normalizedEventName === 'SessionStart' ||
    normalizedEventName === 'UserPromptSubmit' ||
    normalizedEventName === 'PostToolUse' ||
    normalizedEventName === 'PostToolUseFailure'
      ? 'working'
      : isBlockingNotification || isAskUserPrompt
        ? 'blocked'
        : normalizedEventName === 'PreToolUse' || normalizedEventName === 'PermissionRequest'
          ? 'working'
          : normalizedEventName === 'Stop' || normalizedEventName === 'SessionEnd'
            ? 'done'
            : normalizedEventName === 'ErrorOccurred'
              ? hookPayload.recoverable === true
                ? 'working'
                : 'done'
              : null

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(state, paneKey, toolSnapshot, {
    resetOnNewTurn: isNewTurnEvent('copilot', normalizedEventName)
  })

  const effectivePrompt = normalizedEventName === 'Notification' ? '' : promptText

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, effectivePrompt, {
        resetOnNewTurn: isNewTurnEvent('copilot', normalizedEventName)
      }),
      agentType: 'copilot',
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage
    })
  )
}

export function normalizePiCompatibleEvent(
  state: HookListenerState,
  agentType: 'pi' | 'omp',
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  if (agentType === 'pi' && eventName === 'session_start') {
    // Why: opening or resuming Pi starts a provider session, not a user turn;
    // clear stale prompt/tool state without fabricating visible work.
    clearPaneTurnCacheState(state, paneKey)
    return null
  }

  const stateName =
    eventName === 'before_agent_start' ||
    eventName === 'agent_start' ||
    eventName === 'tool_call' ||
    eventName === 'tool_execution_start' ||
    eventName === 'tool_execution_end' ||
    eventName === 'message_end'
      ? 'working'
      : eventName === 'agent_end'
        ? 'done'
        : null

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields(agentType, eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent(agentType, eventName) }
  )

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, promptText, {
        resetOnNewTurn: isNewTurnEvent(agentType, eventName)
      }),
      agentType,
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage
    })
  )
}

export function normalizeDroidEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  if (eventName === 'SessionStart') {
    // Why: Droid emits SessionStart when the TUI opens/resumes while still idle.
    // Only UserPromptSubmit or tool activity should create a visible working row.
    clearPaneTurnCacheState(state, paneKey)
    return null
  }

  const notificationMessage = readString(hookPayload, 'message')
  const droidToolName = readString(hookPayload, 'tool_name') ?? readString(hookPayload, 'name')
  let stateName: 'working' | 'waiting' | 'done' | null = null
  if (
    eventName === 'PreToolUse' &&
    (isDroidAskUserTool(droidToolName) || isDroidHighRiskToolUse(hookPayload))
  ) {
    // Why: Droid surfaces both AskUser and high-risk approval prompts as
    // PreToolUse events; the observed approval path emits no Notification hook.
    stateName = 'waiting'
  } else if (
    eventName === 'UserPromptSubmit' ||
    eventName === 'PreToolUse' ||
    eventName === 'PostToolUse'
  ) {
    stateName = 'working'
  } else if (eventName === 'Stop') {
    stateName = 'done'
  } else if (eventName === 'PermissionRequest') {
    stateName = 'waiting'
  } else if (eventName === 'Notification' && isDroidPermissionNotification(notificationMessage)) {
    stateName = 'waiting'
  } else if (eventName === 'Notification' && isDroidIdleNotification(notificationMessage)) {
    // Why: Factory does not emit Stop when the user interrupts Droid, but it
    // does emit an idle notification when Droid is ready for input again.
    stateName = 'done'
  }
  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('droid', eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent('droid', eventName) }
  )

  // Why: Droid's Notification.message contains status text (e.g. "Droid is
  // waiting for your input"), not the user's prompt. Pass '' so resolvePrompt
  // falls back to the cached UserPromptSubmit value instead of overwriting it.
  const effectivePrompt = eventName === 'Notification' ? '' : promptText

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, effectivePrompt, {
        resetOnNewTurn: isNewTurnEvent('droid', eventName)
      }),
      agentType: 'droid',
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage
    })
  )
}
