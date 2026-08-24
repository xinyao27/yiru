import { extractAgentProviderSession } from '@yiru/workbench-model/agent'
import {
  normalizeAgentStatusPayload,
  type ParsedAgentStatusPayload
} from '@yiru/workbench-model/agent'

import { parsePaneKey } from '../stable-pane-id'
import { normalizeAmpEvent, hasExplicitPromptForSource } from './hook-event-amp'
import { normalizeClaudeEvent } from './hook-event-claude'
import { normalizeCodexEvent } from './hook-event-codex'
import {
  normalizeCommandCodeEvent,
  normalizeGrokEvent,
  normalizeHermesEvent
} from './hook-event-command-grok'
import {
  normalizeCopilotEvent,
  normalizePiCompatibleEvent,
  normalizeDroidEvent
} from './hook-event-copilot-pi'
import { isNewTurnEvent, hasExplicitUserPrompt } from './hook-event-foundation'
import { normalizeOpenCodeFamilyEvent, normalizeCursorEvent } from './hook-event-open-cursor'
import {
  normalizeDevinEvent,
  normalizeKimiEvent,
  normalizeGeminiEvent,
  normalizeAntigravityEvent
} from './hook-event-other'
import type { HookListenerState, AgentHookEventPayload } from './hook-listener-state'
import { MAX_PANE_KEY_LEN, warnOnHookEnvOrVersionMismatch } from './hook-listener-state'
import type { AgentHookSource } from './hook-relay'
import { extractPromptText } from './hook-request'
import { readString, readFirstString } from './hook-tool-preview'
import { readLastUserPromptFromTranscript } from './hook-transcript-claude'
import {
  readLastCommandCodeUserPromptEntryFromTranscript,
  readGrokHomeEnvelope
} from './hook-transcript-command-code'

export function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function normalizeHookPayload(
  state: HookListenerState,
  source: AgentHookSource,
  body: unknown,
  expectedEnv: string
): AgentHookEventPayload | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }

  const record = body as Record<string, unknown>
  const paneKey = typeof record.paneKey === 'string' ? record.paneKey.trim() : ''
  const parsedPaneKey = parsePaneKey(paneKey)
  const rawPayload = record.payload
  const hookPayload =
    typeof rawPayload === 'string'
      ? (() => {
          try {
            return JSON.parse(rawPayload)
          } catch {
            return null
          }
        })()
      : rawPayload
  if (
    !paneKey ||
    paneKey.length > MAX_PANE_KEY_LEN ||
    !parsedPaneKey ||
    typeof hookPayload !== 'object' ||
    hookPayload === null
  ) {
    return null
  }

  warnOnHookEnvOrVersionMismatch(state, {
    version: readStringField(record, 'version'),
    env: readStringField(record, 'env'),
    expectedEnv
  })

  const tabId = readStringField(record, 'tabId')
  if (tabId && tabId !== parsedPaneKey.tabId) {
    return null
  }
  const worktreeId = readStringField(record, 'worktreeId')
  const launchToken = readStringField(record, 'launchToken')

  const hookPayloadRecord = hookPayload as Record<string, unknown>
  let promptInteractionKey: string | undefined
  const eventName =
    readFirstString(record, ['hook_event_name', 'hookEventName', 'hook_type', 'hookType']) ??
    hookPayloadRecord.hook_event_name ??
    hookPayloadRecord.hookEventName
  const extractedPrompt = extractPromptText(hookPayload as Record<string, unknown>)
  const promptText = extractedPrompt.text
  let resolvedPromptText = promptText
  let hasTranscriptPromptEvidence = false
  // Why: exhaustive switch so adding a source to AgentHookSource fails
  // typecheck here instead of silently routing through OpenCode's normalizer.
  let payload: ParsedAgentStatusPayload | null
  switch (source) {
    case 'claude':
      payload = normalizeClaudeEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'codex':
      // Why: Codex writes the same turn id into its structured task_complete
      // rollout event, giving consumers an exact join without reading TUI text.
      promptInteractionKey = readFirstString(hookPayloadRecord, ['turn_id', 'turnId'])
      payload = normalizeCodexEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'gemini':
      payload = normalizeGeminiEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'antigravity':
      if (isNewTurnEvent('antigravity', eventName)) {
        resolvedPromptText =
          promptText ||
          readLastUserPromptFromTranscript(
            readFirstString(hookPayloadRecord, ['transcriptPath', 'transcript_path'])
          ) ||
          ''
      }
      payload = normalizeAntigravityEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'amp':
      payload = normalizeAmpEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'opencode':
    case 'mimo-code':
      if (extractedPrompt.source === 'role_user_text') {
        const messageId = readFirstString(hookPayloadRecord, [
          'messageID',
          'messageId',
          'message_id'
        ])
        const prefix = source === 'mimo-code' ? 'mimo-code-message' : 'opencode-message'
        promptInteractionKey = messageId ? `${prefix}-${messageId}` : undefined
      }
      payload = normalizeOpenCodeFamilyEvent(
        source,
        state,
        eventName,
        promptText,
        paneKey,
        hookPayloadRecord
      )
      break
    case 'cursor':
      payload = normalizeCursorEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'pi':
      payload = normalizePiCompatibleEvent(
        state,
        'pi',
        eventName,
        promptText,
        paneKey,
        hookPayloadRecord
      )
      break
    case 'omp':
      payload = normalizePiCompatibleEvent(
        state,
        'omp',
        eventName,
        promptText,
        paneKey,
        hookPayloadRecord
      )
      break
    case 'droid':
      payload = normalizeDroidEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'command-code':
      {
        const transcriptPrompt = readLastCommandCodeUserPromptEntryFromTranscript(
          hookPayloadRecord.transcript_path ?? hookPayloadRecord.transcriptPath
        )
        hasTranscriptPromptEvidence = transcriptPrompt !== undefined
        promptInteractionKey = transcriptPrompt?.interactionKey
        resolvedPromptText = transcriptPrompt?.text ?? ''
        if (promptText && extractedPrompt.source !== 'message') {
          resolvedPromptText = promptText
        }
      }
      payload = normalizeCommandCodeEvent(
        state,
        eventName,
        resolvedPromptText,
        paneKey,
        hookPayloadRecord
      )
      break
    case 'grok':
      payload = normalizeGrokEvent(
        state,
        eventName,
        promptText,
        paneKey,
        hookPayloadRecord,
        readGrokHomeEnvelope(record)
      )
      break
    case 'copilot':
      payload = normalizeCopilotEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'hermes':
      payload = normalizeHermesEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'devin':
      payload = normalizeDevinEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
    case 'kimi':
      payload = normalizeKimiEvent(state, eventName, promptText, paneKey, hookPayloadRecord)
      break
  }

  // Why: connectionId stays null at the listener layer. The local server keeps
  // it null; the relay forwards null on the wire and Yiru's `ingestRemote`
  // stamps the real value from `mux` identity on receive. See
  // docs/design/agent-status-over-ssh.md §5.
  // Why: Codex child hooks expose the child's session_id on the parent's pane;
  // treating it as the root resume id would replace the terminal's real session.
  const providerSession =
    source === 'codex' && readString(hookPayloadRecord, 'agent_id')
      ? null
      : extractAgentProviderSession(source, hookPayloadRecord)
  const providerSessionOnly =
    source === 'pi' && eventName === 'session_start' && providerSession !== null
  // Why: metadata-only Pi events still cross the status-shaped wire contract;
  // consumers discard this placeholder instead of displaying it.
  const transportPayload =
    payload ??
    (providerSessionOnly
      ? normalizeAgentStatusPayload({ state: 'done', prompt: '', agentType: 'pi' })
      : null)
  return transportPayload
    ? {
        paneKey,
        launchToken,
        tabId,
        worktreeId,
        connectionId: null,
        hasExplicitPrompt:
          source === 'amp'
            ? hasExplicitPromptForSource(source, eventName, promptText, hookPayloadRecord)
              ? true
              : undefined
            : hasExplicitUserPrompt(
                source,
                eventName,
                extractedPrompt,
                resolvedPromptText,
                hasTranscriptPromptEvidence
              ),
        promptInteractionKey,
        hookEventName: typeof eventName === 'string' ? eventName : undefined,
        toolUseId: readFirstString(hookPayloadRecord, ['tool_use_id', 'toolUseId']),
        toolAgentId: readFirstString(hookPayloadRecord, ['agent_id', 'agentId']),
        toolAgentType: readString(hookPayloadRecord, 'agent_type'),
        ...(providerSession ? { providerSession } : {}),
        ...(providerSessionOnly ? { providerSessionOnly: true } : {}),
        payload: transportPayload
      }
    : null
}

// ─── URL routing ────────────────────────────────────────────────────
