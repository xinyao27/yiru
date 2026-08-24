import { parseAgentStatusPayload, type ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'

import { isNewTurnEvent, extractToolFields } from './hook-event-foundation'
import type { HookListenerState } from './hook-listener-state'
import { clearPaneTurnCacheState } from './hook-listener-state'
import { readAntigravityToolCall } from './hook-tool-claude-codex'
import { readString, readFirstString } from './hook-tool-preview'
import { resolvePrompt, resolveToolState } from './hook-tool-state'
import { readLastUserPromptFromTranscript } from './hook-transcript-claude'

export function normalizeDevinEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  if (eventName === 'SessionStart') {
    // Why: Devin emits SessionStart when the TUI opens/resumes while still idle.
    // Only UserPromptSubmit or tool activity should create a visible working row —
    // mapping SessionStart to 'working' made the sidebar show "Devin - Running"
    // with a spinner before the user typed anything.
    clearPaneTurnCacheState(state, paneKey)
    return null
  }

  const stateName =
    eventName === 'UserPromptSubmit' ||
    eventName === 'PreToolUse' ||
    eventName === 'PostToolUse' ||
    eventName === 'PostCompaction'
      ? 'working'
      : eventName === 'PermissionRequest'
        ? 'waiting'
        : eventName === 'Stop' || eventName === 'SessionEnd'
          ? 'done'
          : null

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('devin', eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent('devin', eventName) }
  )

  const interrupted =
    eventName === 'Stop' && hookPayload['is_interrupt'] === true ? true : undefined

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, promptText, {
        resetOnNewTurn: isNewTurnEvent('devin', eventName)
      }),
      agentType: 'devin',
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage,
      interrupted
    })
  )
}

// Why: Kimi's AskUserQuestion tool is auto-allowed, so it emits PreToolUse
// instead of PermissionRequest while blocked on a human answer. Treat it as a
// waiting state so the UI shows the attention icon instead of the working spinner.
export function isKimiUserInputTool(toolName: string | undefined): boolean {
  return toolName?.replaceAll(/[^a-z0-9]/gi, '').toLowerCase() === 'askuserquestion'
}

// Why: Kimi Code emits Claude-compatible hook payloads and reuses Claude's
// lifecycle event names (UserPromptSubmit/PreToolUse/Stop/...). Normalize them
// into Yiru's shared status states while attributing the status to Kimi so the
// sidebar shows the Kimi icon and label instead of falling back to Claude.
export function normalizeKimiEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const toolName = readString(hookPayload, 'tool_name')
  const isUserInputTool = isKimiUserInputTool(toolName)

  let stateName: 'working' | 'waiting' | 'done' | null = null
  if (
    eventName === 'UserPromptSubmit' ||
    eventName === 'PostToolUse' ||
    eventName === 'PostToolUseFailure' ||
    (eventName === 'PreToolUse' && !isUserInputTool)
  ) {
    stateName = 'working'
  } else if (eventName === 'PermissionRequest' || (eventName === 'PreToolUse' && isUserInputTool)) {
    stateName = 'waiting'
  } else if (eventName === 'Stop' || eventName === 'StopFailure') {
    stateName = 'done'
  }

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('kimi', eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent('kimi', eventName) }
  )

  const interrupted =
    eventName === 'Stop' && hookPayload['is_interrupt'] === true ? true : undefined

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, promptText, {
        resetOnNewTurn: isNewTurnEvent('kimi', eventName)
      }),
      agentType: 'kimi',
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      lastAssistantMessage: snapshot.lastAssistantMessage,
      interrupted
    })
  )
}

export function normalizeGeminiEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  // Why: Gemini CLI's native pre-tool event is BeforeTool. PreToolUse/PostToolUse
  // remain accepted for legacy Antigravity-compatible payloads on this endpoint.
  const stateName =
    eventName === 'BeforeAgent' ||
    eventName === 'BeforeTool' ||
    eventName === 'AfterTool' ||
    eventName === 'PreToolUse' ||
    eventName === 'PostToolUse'
      ? 'working'
      : eventName === 'AfterAgent'
        ? 'done'
        : null

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('gemini', eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent('gemini', eventName) }
  )

  return parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, promptText, {
        resetOnNewTurn: isNewTurnEvent('gemini', eventName)
      }),
      agentType: 'gemini',
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage
    })
  )
}

export function isAntigravityFeedbackTool(toolName: string | undefined): boolean {
  return toolName === 'ask_question' || toolName === 'ask_permission'
}

export function isAntigravityStopStillBusy(hookPayload: Record<string, unknown>): boolean {
  return hookPayload.fullyIdle === false || hookPayload.fully_idle === false
}

export function normalizeAntigravityEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const transcriptPath = readFirstString(hookPayload, ['transcriptPath', 'transcript_path'])
  if (eventName === 'PreInvocation') {
    state.antigravityCompletedTranscriptByPaneKey.delete(paneKey)
  } else if (
    transcriptPath &&
    eventName !== 'Stop' &&
    state.antigravityCompletedTranscriptByPaneKey.get(paneKey) === transcriptPath
  ) {
    // Why: agy can emit a bookkeeping PostToolUse after Stop; ignore it so a
    // finished row does not turn back into a yellow spinner.
    return null
  }

  const toolName = readAntigravityToolCall(hookPayload).toolName
  const stopStillBusy = eventName === 'Stop' && isAntigravityStopStillBusy(hookPayload)
  const stateName =
    eventName === 'PreToolUse' && isAntigravityFeedbackTool(toolName)
      ? 'waiting'
      : eventName === 'Stop'
        ? stopStillBusy
          ? 'working'
          : 'done'
        : eventName === 'PreInvocation' ||
            eventName === 'PostInvocation' ||
            eventName === 'PreToolUse' ||
            eventName === 'PostToolUse'
          ? 'working'
          : null

  if (!stateName) {
    return null
  }

  const resetsTurn = isNewTurnEvent('antigravity', eventName)
  // Why: Antigravity transcripts can grow during long tool-heavy turns. Once
  // the prompt is cached for this pane, avoid rescanning the file per hook.
  const cachedPrompt = resetsTurn ? undefined : state.lastPromptByPaneKey.get(paneKey)
  const effectivePrompt =
    promptText || cachedPrompt || readLastUserPromptFromTranscript(transcriptPath) || ''
  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('antigravity', eventName, hookPayload),
    { resetOnNewTurn: resetsTurn }
  )

  const payload = parseAgentStatusPayload(
    JSON.stringify({
      state: stateName,
      prompt: resolvePrompt(state, paneKey, effectivePrompt, {
        resetOnNewTurn: resetsTurn
      }),
      agentType: 'antigravity',
      toolName: snapshot.toolName,
      toolInput: snapshot.toolInput,
      interactivePrompt: snapshot.interactivePrompt,
      lastAssistantMessage: snapshot.lastAssistantMessage
    })
  )
  // Why: Antigravity can emit Stop with fullyIdle=false between tool steps.
  // Only a fully idle Stop is terminal; otherwise the sidebar would bounce
  // done -> working during tool-heavy turns and ignore later tool updates.
  if (eventName === 'Stop' && !stopStillBusy && transcriptPath) {
    state.antigravityCompletedTranscriptByPaneKey.set(paneKey, transcriptPath)
  }
  return payload
}
