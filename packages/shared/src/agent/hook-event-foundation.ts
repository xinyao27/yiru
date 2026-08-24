import { isKnownHarnessInjectedUserTurnText } from '@yiru/workbench-model/agent'

import type { AgentHookSource } from './hook-relay'
import type { ExtractedPromptText } from './hook-request'
import {
  extractAmpToolFields,
  extractOpenCodeToolFields,
  extractCursorToolFields
} from './hook-tool-amp-cursor'
import {
  extractClaudeToolFields,
  extractCodexToolFields,
  extractGeminiToolFields,
  extractAntigravityToolFields
} from './hook-tool-claude-codex'
import {
  extractCommandCodeToolFields,
  isGrokEvent,
  extractGrokToolFields,
  extractHermesToolFields
} from './hook-tool-command-grok'
import {
  normalizeCopilotEventName,
  extractCopilotToolFields,
  extractPiToolFields
} from './hook-tool-copilot'
import { extractDroidToolFields } from './hook-tool-droid'
import type { ToolSnapshot } from './hook-tool-state'

export function isNewTurnEvent(source: AgentHookSource, eventName: unknown): boolean {
  // Why: exhaustive switch so adding a source to AgentHookSource fails
  // typecheck here instead of silently falling through to `false`.
  switch (source) {
    case 'claude':
    // Why: Kimi Code emits Claude-compatible hook events, so UserPromptSubmit
    // is its new-turn boundary too.
    case 'kimi':
      return eventName === 'UserPromptSubmit'
    case 'codex':
      return eventName === 'SessionStart' || eventName === 'UserPromptSubmit'
    case 'gemini':
      return eventName === 'BeforeAgent'
    case 'antigravity':
      return eventName === 'PreInvocation'
    case 'amp':
      return eventName === 'agent.start'
    case 'opencode':
    case 'mimo-code':
      return false
    case 'cursor':
      return eventName === 'beforeSubmitPrompt' || eventName === 'sessionStart'
    case 'pi':
    case 'omp':
      return eventName === 'before_agent_start'
    case 'droid':
      return eventName === 'UserPromptSubmit'
    case 'command-code':
      return false
    case 'grok':
      return isGrokEvent(eventName, 'user_prompt_submit')
    case 'copilot': {
      const normalizedEventName = normalizeCopilotEventName(eventName)
      return normalizedEventName === 'SessionStart' || normalizedEventName === 'UserPromptSubmit'
    }
    case 'hermes':
      return eventName === 'pre_llm_call' || eventName === 'on_session_start'
    case 'devin':
      // Why: SessionStart is handled by an early return in normalizeDevinEvent
      // (clears turn cache, returns null) so it never reaches this branch.
      // UserPromptSubmit is the real new-turn boundary for Devin.
      return eventName === 'UserPromptSubmit'
  }
}

export function hasExplicitUserPrompt(
  source: AgentHookSource,
  eventName: unknown,
  extractedPrompt: ExtractedPromptText,
  resolvedPromptText: string,
  hasTranscriptPromptEvidence = false
): boolean {
  if (
    source === 'command-code' &&
    (eventName === 'PreToolUse' || eventName === 'Stop') &&
    (extractedPrompt.source !== 'message' || hasTranscriptPromptEvidence) &&
    resolvedPromptText.trim().length > 0
  ) {
    // Why: Command Code exposes the submitted prompt through its transcript
    // rather than direct hook fields. Treat the transcript-backed prompt as
    // explicit so hook telemetry covers real Command Code turns.
    return true
  }
  if (
    source === 'antigravity' &&
    isNewTurnEvent(source, eventName) &&
    resolvedPromptText.trim().length > 0
  ) {
    return true
  }
  if (extractedPrompt.source === 'role_user_text') {
    return (source === 'opencode' || source === 'mimo-code') && eventName === 'MessagePart'
  }
  if (extractedPrompt.text.length === 0) {
    return false
  }
  // Why: harness-injected machinery turns are not proof of a user submit —
  // they must not count for prompt-sent telemetry or permission stickiness.
  // Match only known harness tags: a real prompt starting with a custom
  // `<my-element>` is an explicit user turn and must survive interrupt recovery
  // (a false "not explicit" leaves the agent visibly done after Ctrl+C).
  if (isKnownHarnessInjectedUserTurnText(extractedPrompt.text)) {
    return false
  }
  // Why: bare `message` fields often contain permission or status copy. They
  // may update visible status prompts, but they are not proof of user submit.
  if (extractedPrompt.source === 'message') {
    return false
  }
  if (
    extractedPrompt.source === 'user_prompt' ||
    extractedPrompt.source === 'userPrompt' ||
    extractedPrompt.source === 'user_message'
  ) {
    return isNewTurnEvent(source, eventName)
  }
  return isNewTurnEvent(source, eventName)
}

export function extractToolFields(
  source: AgentHookSource,
  eventName: unknown,
  hookPayload: Record<string, unknown>,
  options?: { grokHome?: string }
): ToolSnapshot {
  // Why: exhaustive switch so adding a source to AgentHookSource fails
  // typecheck here instead of silently routing through OpenCode's extractor.
  switch (source) {
    case 'claude':
    // Why: Kimi Code uses Claude's tool_name/tool_input payload fields verbatim.
    case 'kimi':
      return extractClaudeToolFields(eventName, hookPayload)
    case 'codex':
      return extractCodexToolFields(eventName, hookPayload)
    case 'gemini':
      return extractGeminiToolFields(eventName, hookPayload)
    case 'antigravity':
      return extractAntigravityToolFields(eventName, hookPayload)
    case 'amp':
      return extractAmpToolFields(eventName, hookPayload)
    case 'opencode':
    case 'mimo-code':
      return extractOpenCodeToolFields(eventName, hookPayload)
    case 'cursor':
      return extractCursorToolFields(eventName, hookPayload)
    case 'pi':
    case 'omp':
      return extractPiToolFields(eventName, hookPayload)
    case 'droid':
      return extractDroidToolFields(eventName, hookPayload)
    case 'command-code':
      return extractCommandCodeToolFields(eventName, hookPayload)
    case 'grok':
      return extractGrokToolFields(eventName, hookPayload, options?.grokHome)
    case 'copilot':
      return extractCopilotToolFields(normalizeCopilotEventName(eventName), hookPayload)
    case 'hermes':
      return extractHermesToolFields(eventName, hookPayload)
    case 'devin':
      return extractClaudeToolFields(eventName, hookPayload)
  }
}
