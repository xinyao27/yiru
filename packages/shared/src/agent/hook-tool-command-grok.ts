import { readLastAssistantFromGrokChatHistory } from './hook-grok-history'
import {
  readString,
  hasOwnField,
  hasAnyOwnField,
  toolUpdate,
  clearActiveToolFieldsUpdate,
  deriveInteractivePrompt,
  extractToolResponseText
} from './hook-tool-preview'
import type { ToolSnapshot } from './hook-tool-state'
import { deriveToolInputPreview, deriveFallbackToolInputPreview } from './hook-tool-state'
import { readLastAssistantFromTranscript } from './hook-transcript-claude'
import { readLastCommandCodeAssistantFromTranscript } from './hook-transcript-command-code'

export function extractCommandCodeToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (eventName === 'PreToolUse' || eventName === 'PostToolUse') {
    const toolName =
      readString(hookPayload, 'tool_name') ??
      readString(hookPayload, 'toolName') ??
      readString(hookPayload, 'tool_display_name')
    const toolInput =
      deriveToolInputPreview(toolName, hookPayload.tool_input) ??
      deriveFallbackToolInputPreview(hookPayload.tool_input)
    const update: ToolSnapshot = toolUpdate(
      { toolName, toolInput },
      { hasToolInputField: hasOwnField(hookPayload, 'tool_input') }
    )
    if (eventName === 'PostToolUse') {
      const responseText =
        extractToolResponseText(hookPayload.tool_response) ??
        extractToolResponseText(hookPayload.tool_output)
      if (responseText) {
        update.lastAssistantMessage = responseText
      }
    }
    return update
  }
  if (eventName === 'Stop') {
    const direct = readString(hookPayload, 'last_assistant_message')
    if (direct) {
      return { lastAssistantMessage: direct }
    }
    const fromTranscript = readLastCommandCodeAssistantFromTranscript(
      hookPayload.transcript_path ?? hookPayload.transcriptPath
    )
    if (fromTranscript) {
      return { lastAssistantMessage: fromTranscript }
    }
  }
  return {}
}

export function normalizeHookEventName(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

export function isGrokEvent(eventName: unknown, ...expected: readonly string[]): boolean {
  const normalized = normalizeHookEventName(eventName)
  return expected.includes(normalized)
}

export function extractGrokToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>,
  grokHome?: string
): ToolSnapshot {
  if (isGrokEvent(eventName, 'pre_tool_use', 'post_tool_use', 'post_tool_use_failure')) {
    const update: ToolSnapshot = {}
    if (isGrokEvent(eventName, 'post_tool_use_failure')) {
      Object.assign(update, clearActiveToolFieldsUpdate())
    } else {
      const toolName =
        readString(hookPayload, 'toolName') ??
        readString(hookPayload, 'tool_name') ??
        readString(hookPayload, 'name')
      const rawInput =
        hookPayload.toolInput ??
        hookPayload.tool_input ??
        hookPayload.input ??
        hookPayload.arguments
      const toolInput =
        deriveToolInputPreview(toolName, rawInput) ?? deriveFallbackToolInputPreview(rawInput)
      // Why: Grok's ask_user_question is auto-allowed and arrives as PreToolUse
      // (not PermissionRequest). Capture the full question payload so the live
      // card path can render options instead of only a waiting Notification.
      const interactivePrompt = deriveInteractivePrompt(toolName, rawInput, eventName)
      Object.assign(
        update,
        toolUpdate(
          { toolName, toolInput, interactivePrompt },
          {
            hasToolInputField: hasAnyOwnField(hookPayload, [
              'toolInput',
              'tool_input',
              'input',
              'arguments'
            ])
          }
        )
      )
    }
    if (isGrokEvent(eventName, 'post_tool_use', 'post_tool_use_failure')) {
      const responseText =
        extractToolResponseText(hookPayload.toolResponse) ??
        extractToolResponseText(hookPayload.tool_response) ??
        extractToolResponseText(hookPayload.toolOutput) ??
        extractToolResponseText(hookPayload.tool_output) ??
        readString(hookPayload, 'error') ??
        readString(hookPayload, 'message')
      if (responseText) {
        update.lastAssistantMessage = responseText
      }
    }
    return update
  }
  if (isGrokEvent(eventName, 'stop', 'session_end', 'stop_failure')) {
    const direct =
      readString(hookPayload, 'lastAssistantMessage') ??
      readString(hookPayload, 'last_assistant_message')
    if (direct) {
      return { lastAssistantMessage: direct }
    }
    const fromTranscript = readLastAssistantFromTranscript(
      hookPayload.transcriptPath ?? hookPayload.transcript_path
    )
    if (fromTranscript) {
      return { lastAssistantMessage: fromTranscript }
    }
    const fromChatHistory = readLastAssistantFromGrokChatHistory(hookPayload, grokHome)
    if (fromChatHistory) {
      return { lastAssistantMessage: fromChatHistory }
    }
  }
  return {}
}

export function extractHermesToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (
    eventName === 'pre_tool_call' ||
    eventName === 'post_tool_call' ||
    eventName === 'pre_approval_request' ||
    eventName === 'post_approval_response'
  ) {
    const toolName =
      readString(hookPayload, 'tool_name') ??
      readString(hookPayload, 'name') ??
      (eventName === 'pre_approval_request' || eventName === 'post_approval_response'
        ? 'approval'
        : undefined)
    const toolInput =
      deriveToolInputPreview(toolName, hookPayload.tool_input) ??
      deriveToolInputPreview(toolName, hookPayload.args) ??
      deriveToolInputPreview(toolName, hookPayload.input) ??
      // Why: Hermes exposes many first-party/plugin tool names. When a new
      // name appears, still show the obvious argument instead of a blank row.
      deriveFallbackToolInputPreview(hookPayload.tool_input) ??
      deriveFallbackToolInputPreview(hookPayload.args) ??
      deriveFallbackToolInputPreview(hookPayload.input) ??
      readString(hookPayload, 'command') ??
      readString(hookPayload, 'description')
    const update: ToolSnapshot = toolUpdate(
      { toolName, toolInput },
      {
        hasToolInputField: hasAnyOwnField(hookPayload, [
          'tool_input',
          'args',
          'input',
          'command',
          'description'
        ])
      }
    )
    if (eventName === 'post_tool_call') {
      const responseText =
        extractToolResponseText(hookPayload.result) ??
        extractToolResponseText(hookPayload.tool_response) ??
        extractToolResponseText(hookPayload.output)
      if (responseText) {
        update.lastAssistantMessage = responseText
      }
    }
    return update
  }
  if (eventName === 'post_llm_call') {
    const message =
      readString(hookPayload, 'last_assistant_message') ??
      readString(hookPayload, 'assistant_response') ??
      readString(hookPayload, 'response_text')
    if (message) {
      return { lastAssistantMessage: message }
    }
  }
  return {}
}

export function isGrokPermissionNotification(message: string | undefined): boolean {
  if (!message) {
    return false
  }
  const lower = message.toLowerCase()
  return (
    lower.includes('permission') ||
    lower.includes('approval') ||
    lower.includes('approve') ||
    lower.includes('allow') ||
    lower.includes('confirm') ||
    lower.includes('needs your') ||
    lower.includes('requires your') ||
    lower.includes('feedback') ||
    lower.includes('clarify') ||
    lower.includes('question')
  )
}

export function getGrokNotificationType(hookPayload: Record<string, unknown>): string | undefined {
  return (
    readString(hookPayload, 'notificationType') ??
    readString(hookPayload, 'notification_type') ??
    readString(hookPayload, 'type')
  )
}

export function isGrokRoutinePermissionPromptNotification(
  notificationType: string | undefined,
  message: string | undefined,
  level: string | undefined
): boolean {
  // Why: Grok emits this info notification before each tool even under
  // bypassPermissions; PreToolUse already captures progress without paging users.
  return (
    isGrokEvent(notificationType, 'permission_prompt') &&
    message?.trim().toLowerCase() === 'tool permission requested' &&
    (!level || level.trim().toLowerCase() === 'info')
  )
}

export function isGrokIdleNotification(message: string | undefined): boolean {
  if (!message) {
    return false
  }
  const lower = message.toLowerCase()
  return (
    lower.includes('type your message') ||
    lower.includes('enter send') ||
    lower.includes('shift-tab normal') ||
    lower.includes('ask a side question')
  )
}
