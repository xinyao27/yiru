import { isAntigravityStopStillBusy } from './hook-event-other'
import {
  readString,
  hasOwnField,
  hasAnyOwnField,
  toolUpdate,
  clearActiveToolFieldsUpdate,
  deriveInteractivePrompt,
  readFirstString,
  extractToolResponseText
} from './hook-tool-preview'
import type { ToolSnapshot } from './hook-tool-state'
import { deriveToolInputPreview, deriveFallbackToolInputPreview } from './hook-tool-state'
import { readLastAssistantFromTranscript } from './hook-transcript-claude'

export function extractClaudeToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  const update: ToolSnapshot = {}
  if (eventName === 'PostToolUseFailure') {
    Object.assign(update, clearActiveToolFieldsUpdate())
  } else if (
    eventName === 'PreToolUse' ||
    eventName === 'PostToolUse' ||
    eventName === 'PermissionRequest'
  ) {
    const toolName = readString(hookPayload, 'tool_name')
    Object.assign(
      update,
      toolUpdate(
        {
          toolName,
          toolInput: deriveToolInputPreview(toolName, hookPayload.tool_input),
          interactivePrompt: deriveInteractivePrompt(toolName, hookPayload.tool_input, eventName)
        },
        { hasToolInputField: hasOwnField(hookPayload, 'tool_input') }
      )
    )
  }
  if (eventName === 'PostToolUse') {
    const responseText = extractToolResponseText(hookPayload.tool_response)
    if (responseText) {
      update.lastAssistantMessage = responseText
    }
  }
  if (eventName === 'PostToolUseFailure') {
    const errorText =
      extractToolResponseText(hookPayload.tool_response) ??
      readString(hookPayload, 'error') ??
      readString(hookPayload, 'message')
    if (errorText) {
      update.lastAssistantMessage = errorText
    }
  }
  if (eventName === 'Stop') {
    const direct = readString(hookPayload, 'last_assistant_message')
    if (direct) {
      update.lastAssistantMessage = direct
    } else {
      const lastFromTranscript = readLastAssistantFromTranscript(hookPayload.transcript_path)
      if (lastFromTranscript) {
        update.lastAssistantMessage = lastFromTranscript
      }
    }
  }
  return update
}

export function extractCodexToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (
    eventName === 'PreToolUse' ||
    eventName === 'PermissionRequest' ||
    eventName === 'PostToolUse'
  ) {
    const toolName = readString(hookPayload, 'tool_name') ?? readString(hookPayload, 'name')
    const rawInput = hookPayload.tool_input ?? hookPayload.input ?? hookPayload.arguments
    const toolInput =
      deriveToolInputPreview(toolName, hookPayload.tool_input) ??
      deriveToolInputPreview(toolName, hookPayload.input) ??
      deriveToolInputPreview(toolName, hookPayload.arguments)
    return toolUpdate(
      {
        toolName,
        toolInput,
        interactivePrompt: deriveInteractivePrompt(toolName, rawInput, eventName)
      },
      { hasToolInputField: hasAnyOwnField(hookPayload, ['tool_input', 'input', 'arguments']) }
    )
  }
  if (eventName === 'Stop') {
    const message = readString(hookPayload, 'last_assistant_message')
    if (message) {
      return { lastAssistantMessage: message }
    }
  }
  return {}
}

export function extractGeminiToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (
    eventName === 'BeforeTool' ||
    eventName === 'AfterTool' ||
    eventName === 'PreToolUse' ||
    eventName === 'PostToolUse'
  ) {
    const toolName = readString(hookPayload, 'tool_name') ?? readString(hookPayload, 'name')
    const toolInput =
      deriveToolInputPreview(toolName, hookPayload.tool_input) ??
      deriveToolInputPreview(toolName, hookPayload.args) ??
      deriveToolInputPreview(toolName, hookPayload.input)
    return toolUpdate(
      { toolName, toolInput },
      { hasToolInputField: hasAnyOwnField(hookPayload, ['tool_input', 'args', 'input']) }
    )
  }
  if (eventName === 'AfterAgent') {
    const message = readString(hookPayload, 'prompt_response')
    if (message) {
      return { lastAssistantMessage: message }
    }
  }
  return {}
}

export function readAntigravityToolCall(hookPayload: Record<string, unknown>): {
  toolName?: string
  toolInputSource?: unknown
} {
  const toolCall = hookPayload.toolCall
  if (typeof toolCall !== 'object' || toolCall === null) {
    return {}
  }
  const record = toolCall as Record<string, unknown>
  return {
    toolName: readFirstString(record, ['name', 'toolName', 'tool_name']),
    toolInputSource: record.args
  }
}

export function extractAntigravityToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (eventName === 'PreToolUse' || eventName === 'PostToolUse') {
    const toolCall = readAntigravityToolCall(hookPayload)
    const toolName = toolCall.toolName
    const toolInput =
      deriveToolInputPreview(toolName, toolCall.toolInputSource) ??
      deriveFallbackToolInputPreview(toolCall.toolInputSource)
    return toolUpdate(
      { toolName, toolInput },
      { hasToolInputField: toolCall.toolInputSource !== undefined }
    )
  }
  if (eventName === 'Stop') {
    if (isAntigravityStopStillBusy(hookPayload)) {
      return {}
    }
    const message =
      readString(hookPayload, 'last_assistant_message') ??
      readLastAssistantFromTranscript(hookPayload.transcriptPath ?? hookPayload.transcript_path)
    if (message) {
      return { lastAssistantMessage: message }
    }
  }
  return {}
}
