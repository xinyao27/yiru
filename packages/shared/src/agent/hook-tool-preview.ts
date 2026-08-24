import { normalizeHookEventName } from './hook-tool-command-grok'
import type { ToolSnapshot } from './hook-tool-state'

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function hasOwnField(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

export function hasAnyOwnField(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => hasOwnField(record, key))
}

export function toolUpdate(
  fields: Pick<ToolSnapshot, 'toolName' | 'toolInput' | 'interactivePrompt'>,
  options?: { hasToolInputField?: boolean }
): ToolSnapshot {
  return {
    ...fields,
    hasToolUpdate: true,
    hasToolInputField: options?.hasToolInputField === true
  }
}

/** Clear the active-tool metadata (name/input/prompt) so a just-failed tool
 *  stops looking in-flight. Why: the compact sidebar prioritizes current-tool
 *  metadata over the failure message, so a completed failed tool must no
 *  longer look active or the error text stays hidden behind the tool name. */
export function clearActiveToolFieldsUpdate(): ToolSnapshot {
  return toolUpdate(
    { toolName: undefined, toolInput: undefined, interactivePrompt: undefined },
    { hasToolInputField: true }
  )
}

/** True for the AskUserQuestion tool across the casing variants different
 *  agents emit (`AskUserQuestion` / `ask_user_question` / `askUserQuestion`).
 *  Why: this is the structured "pick an option" prompt whose full input the
 *  clients render as a live card. */
export function isAskUserQuestionTool(toolName: string | undefined): boolean {
  return toolName?.replaceAll(/[^a-z0-9]/gi, '').toLowerCase() === 'askuserquestion'
}

/** Capture the full AskUserQuestion tool input as a JSON string when the tool
 *  is an AskUserQuestion variant; otherwise undefined so resolveToolState
 *  clears any prior prompt. Kept agent-generic: callers pass whatever raw
 *  tool-input object their hook payload exposed. */
/** Drop the hook envelope keys a plugin merges into its event properties so
 *  the serialized interactive prompt holds only the question structure. */
export function stripHookEnvelopeKeys(record: Record<string, unknown>): Record<string, unknown> {
  const { hook_event_name: _h, hookEventName: _he, ...rest } = record
  return rest
}

/** Short, single-line description of a tool call for an approval card (the
 *  command for Bash, the path for file tools, else a clipped JSON preview). */
export function summarizeApprovalInput(toolInput: unknown): string {
  if (toolInput && typeof toolInput === 'object') {
    const obj = toolInput as Record<string, unknown>
    const direct = obj.command ?? obj.file_path ?? obj.path ?? obj.url ?? obj.pattern
    if (typeof direct === 'string' && direct.length > 0) {
      return direct.length > 200 ? `${direct.slice(0, 200)}…` : direct
    }
  }
  try {
    const json = JSON.stringify(toolInput) ?? ''
    return json.length > 200 ? `${json.slice(0, 200)}…` : json
  } catch {
    return ''
  }
}

/** Capture a pending interactive prompt as a normalized JSON envelope:
 *  - AskUserQuestion → the raw `{ questions: [...] }` structure (kind inferred
 *    by the client from the `questions` key, kept stable for back-compat).
 *  - any other tool on a PermissionRequest → `{ approval: { tool, summary } }`
 *    so the client can render an Allow/Deny card.
 *  Returns undefined otherwise so resolveToolState clears any prior prompt. */
export function deriveInteractivePrompt(
  toolName: string | undefined,
  toolInput: unknown,
  eventName?: unknown
): string | undefined {
  // Why: providers vary event casing; any post-tool event means the question is
  // no longer pending and must not recreate its answered live card.
  const normalizedEventName = normalizeHookEventName(eventName)
  const isPostToolEvent =
    normalizedEventName === 'post_tool_use' || normalizedEventName === 'post_tool_use_failure'
  if (
    isAskUserQuestionTool(toolName) &&
    !isPostToolEvent &&
    toolInput !== undefined &&
    toolInput !== null
  ) {
    try {
      return JSON.stringify(toolInput)
    } catch {
      // Why: defend against circular/unserializable input from a buggy agent —
      // a missing live card is better than throwing in the hook hot path.
      return undefined
    }
  }
  if (eventName === 'PermissionRequest' && typeof toolName === 'string' && toolName.length > 0) {
    try {
      return JSON.stringify({
        approval: { tool: toolName, summary: summarizeApprovalInput(toolInput) }
      })
    } catch {
      return undefined
    }
  }
  return undefined
}

export function readFirstString(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = readString(record, key)
    if (value) {
      return value
    }
  }
  return undefined
}

export function parseJsonObjectString(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

export function extractToolResponseText(toolResponse: unknown): string | undefined {
  if (typeof toolResponse === 'string' && toolResponse.length > 0) {
    return toolResponse
  }
  if (typeof toolResponse !== 'object' || toolResponse === null) {
    return undefined
  }
  const record = toolResponse as Record<string, unknown>
  const directText = readFirstString(record, ['text_result_for_llm', 'textResultForLlm', 'text'])
  if (directText) {
    return directText
  }
  const content = record.content
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'object' && part !== null) {
        const text = (part as Record<string, unknown>).text
        if (typeof text === 'string' && text.trim().length > 0) {
          return text
        }
      }
    }
  }
  return undefined
}
