import { capOpenCodeHookText } from './hook-listener-state'
import {
  readString,
  hasOwnField,
  hasAnyOwnField,
  toolUpdate,
  clearActiveToolFieldsUpdate,
  stripHookEnvelopeKeys,
  deriveInteractivePrompt,
  readFirstString,
  extractToolResponseText
} from './hook-tool-preview'
import type { ToolSnapshot } from './hook-tool-state'
import { deriveToolInputPreview, deriveFallbackToolInputPreview } from './hook-tool-state'

export function extractAmpToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (eventName === 'tool.call' || eventName === 'tool.result') {
    const toolName =
      readString(hookPayload, 'tool') ??
      readString(hookPayload, 'toolName') ??
      readString(hookPayload, 'name')
    const toolInput =
      deriveToolInputPreview(toolName, hookPayload.input) ??
      deriveToolInputPreview(toolName, hookPayload.tool_input) ??
      deriveToolInputPreview(toolName, hookPayload.arguments) ??
      // Why: Amp plugin tools can have arbitrary names, so fall back to the
      // obvious argument fields instead of rendering an empty tool preview.
      deriveFallbackToolInputPreview(hookPayload.input) ??
      deriveFallbackToolInputPreview(hookPayload.tool_input) ??
      deriveFallbackToolInputPreview(hookPayload.arguments)
    const update: ToolSnapshot = toolUpdate(
      { toolName, toolInput },
      { hasToolInputField: hasAnyOwnField(hookPayload, ['input', 'tool_input', 'arguments']) }
    )
    if (eventName === 'tool.result') {
      const responseText =
        readFirstString(hookPayload, ['error', 'output', 'result', 'message']) ??
        extractToolResponseText(hookPayload.output) ??
        extractToolResponseText(hookPayload.result)
      if (responseText) {
        update.lastAssistantMessage = responseText
      }
    }
    return update
  }
  return {}
}

export function extractOpenCodeToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (eventName === 'MessagePart' && hookPayload.role === 'assistant') {
    const text = readString(hookPayload, 'text')
    if (text) {
      return { lastAssistantMessage: capOpenCodeHookText(text) }
    }
  }
  if (eventName === 'AskUserQuestion') {
    // Why: OpenCode posts the question.asked event's `event.properties` as the
    // hook payload (the plugin merges `hook_event_name` into it). The structured
    // input is that object — minus the hook envelope key — or its `tool_input`
    // when wrapped. Capture the full JSON so clients render the live card.
    const toolInputSource = hasOwnField(hookPayload, 'tool_input')
      ? hookPayload.tool_input
      : stripHookEnvelopeKeys(hookPayload)
    return {
      hasToolUpdate: true,
      interactivePrompt: deriveInteractivePrompt('AskUserQuestion', toolInputSource)
    }
  }
  return {}
}

export function extractCursorToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (
    eventName === 'preToolUse' ||
    eventName === 'postToolUse' ||
    eventName === 'postToolUseFailure'
  ) {
    const update: ToolSnapshot = {}
    if (eventName === 'postToolUseFailure') {
      Object.assign(update, clearActiveToolFieldsUpdate())
    } else {
      const toolName = readString(hookPayload, 'tool_name')
      const toolInput = deriveToolInputPreview(toolName, hookPayload.tool_input)
      Object.assign(
        update,
        toolUpdate(
          { toolName, toolInput },
          { hasToolInputField: hasOwnField(hookPayload, 'tool_input') }
        )
      )
    }
    if (eventName === 'postToolUse') {
      const responseText = extractToolResponseText(hookPayload.tool_output)
      if (responseText) {
        update.lastAssistantMessage = responseText
      }
    }
    if (eventName === 'postToolUseFailure') {
      const errorText =
        extractToolResponseText(hookPayload.tool_output) ??
        readString(hookPayload, 'error_message') ??
        readString(hookPayload, 'error')
      if (errorText) {
        update.lastAssistantMessage = errorText
      }
    }
    return update
  }
  if (eventName === 'beforeShellExecution') {
    const command = readString(hookPayload, 'command')
    return toolUpdate(
      { toolName: 'Shell', toolInput: command },
      { hasToolInputField: hasOwnField(hookPayload, 'command') }
    )
  }
  if (eventName === 'beforeMCPExecution') {
    const toolName = readString(hookPayload, 'tool_name') ?? 'MCP'
    const toolInput =
      deriveToolInputPreview(toolName, hookPayload.tool_input) ??
      readString(hookPayload, 'command') ??
      readString(hookPayload, 'url')
    return toolUpdate(
      { toolName, toolInput },
      { hasToolInputField: hasAnyOwnField(hookPayload, ['tool_input', 'command', 'url']) }
    )
  }
  if (eventName === 'afterAgentResponse') {
    const text = readString(hookPayload, 'text')
    if (text) {
      return { lastAssistantMessage: text }
    }
  }
  return {}
}
