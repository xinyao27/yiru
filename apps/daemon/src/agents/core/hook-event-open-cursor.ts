import {
  parseAgentStatusPayload,
  type ParsedAgentStatusPayload
} from '@yiru/runtime-protocol/model/agent'

import { isNewTurnEvent, extractToolFields } from './hook-event-foundation'
import type { HookListenerState } from './hook-listener-state'
import { resolvePrompt, resolveToolState } from './hook-tool-state'

export function normalizeOpenCodeFamilyEvent(
  source: 'opencode' | 'mimo-code',
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const stateName =
    eventName === 'SessionBusy' || eventName === 'MessagePart'
      ? 'working'
      : eventName === 'SessionIdle'
        ? 'done'
        : eventName === 'PermissionRequest' || eventName === 'AskUserQuestion'
          ? 'waiting'
          : null

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields(source, eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent(source, eventName) }
  )

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, promptText, {
        resetOnNewTurn: isNewTurnEvent(source, eventName)
      }),
      agentType: source,
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage
    })
  )
}

export function normalizeCursorEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  // Why: Cursor can emit the final response text after `stop`; that should
  // enrich the completed row, not resurrect the agent as working.
  const previousStatus = state.lastStatusByPaneKey.get(paneKey)?.payload
  const stateName =
    eventName === 'beforeSubmitPrompt' ||
    eventName === 'sessionStart' ||
    eventName === 'preToolUse' ||
    eventName === 'postToolUse' ||
    eventName === 'postToolUseFailure' ||
    // Why: these fire for every shell/MCP invocation as pre-execution gates,
    // not only when the user is blocked on approval. Treat them like PreToolUse
    // so a tool-heavy turn does not spam waiting-state notifications.
    eventName === 'beforeShellExecution' ||
    eventName === 'beforeMCPExecution'
      ? 'working'
      : eventName === 'afterAgentResponse'
        ? previousStatus?.state === 'done' && previousStatus.agentType === 'cursor'
          ? 'done'
          : 'working'
        : eventName === 'stop' || eventName === 'sessionEnd'
          ? 'done'
          : null

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('cursor', eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent('cursor', eventName) }
  )

  const interrupted =
    eventName === 'stop' &&
    typeof hookPayload.status === 'string' &&
    hookPayload.status !== 'completed'
      ? true
      : undefined

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, promptText, {
        resetOnNewTurn: isNewTurnEvent('cursor', eventName)
      }),
      agentType: 'cursor',
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage,
      interrupted
    })
  )
}

// Why: PermissionRequest fires before Copilot's allow/ask/deny checks, so a
// generic PermissionRequest stays working. `ask_user` itself is a user-input
// boundary, and notification prompts are the async user-visible blocked signal.
