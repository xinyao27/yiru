// Codex JSONL line → NativeChatMessage decoder.

import type { NativeChatBlock, NativeChatMessage } from '@yiru/workbench-model/agent'

import {
  asRecord,
  extractString,
  parseJsonObject,
  timestampMs
} from '../ai-vault/session/scanner-values'
import { claudeContentBlocks, toolResultOutput } from './transcript-record-blocks'

export function decodeCodexTranscriptLine(
  line: string,
  fallbackId: string
): NativeChatMessage | null {
  const record = parseJsonObject(line)
  if (!record) {
    return null
  }
  const payload = asRecord(record.payload)
  if (!payload) {
    return null
  }
  const timestamp = parseTimestamp(record.timestamp)
  const baseId = extractString(payload.id) ?? fallbackId

  if (record.type === 'response_item') {
    return codexResponseItem(payload, baseId, timestamp)
  }
  if (record.type === 'event_msg') {
    return codexEventMessage(payload, baseId, timestamp)
  }
  return null
}

function codexResponseItem(
  payload: Record<string, unknown>,
  id: string,
  timestamp: number | null
): NativeChatMessage | null {
  if (payload.type === 'message') {
    const blocks = claudeContentBlocks(payload.content)
    if (blocks.length === 0) {
      return null
    }
    const role =
      payload.role === 'assistant' ? 'assistant' : payload.role === 'user' ? 'user' : 'system'
    return { id, role, blocks, timestamp, source: 'transcript' }
  }
  if (payload.type === 'reasoning') {
    const text = extractString(payload.text) ?? codexSummaryText(payload.summary)
    if (!text) {
      return null
    }
    return {
      id,
      role: 'reasoning',
      blocks: [{ type: 'text', text }],
      timestamp,
      source: 'transcript'
    }
  }
  if (
    payload.type === 'function_call' ||
    payload.type === 'local_shell_call' ||
    payload.type === 'custom_tool_call'
  ) {
    const name = extractString(payload.name) ?? 'tool'
    const callId = extractString(payload.call_id)
    return {
      id,
      role: 'assistant',
      blocks: [
        {
          type: 'tool-call',
          name,
          input: codexCallInput(payload),
          ...(callId ? { callId } : {})
        }
      ],
      timestamp,
      source: 'transcript'
    }
  }
  if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
    const callId = extractString(payload.call_id)
    return {
      id,
      role: 'tool',
      blocks: [codexToolResult(payload.output, callId)],
      timestamp,
      source: 'transcript'
    }
  }
  return null
}

function codexEventMessage(
  payload: Record<string, unknown>,
  id: string,
  timestamp: number | null
): NativeChatMessage | null {
  if (payload.type === 'item_completed') {
    const item = asRecord(payload.item)
    return item ? codexCompletedItem(item, extractString(item.id) ?? id, timestamp) : null
  }
  if (payload.type === 'user_message') {
    const text = extractString(payload.message)
    return text
      ? { id, role: 'user', blocks: [{ type: 'text', text }], timestamp, source: 'transcript' }
      : null
  }
  if (payload.type === 'agent_message') {
    const text = extractString(payload.message)
    return text
      ? { id, role: 'assistant', blocks: [{ type: 'text', text }], timestamp, source: 'transcript' }
      : null
  }
  return null
}

function codexCompletedItem(
  item: Record<string, unknown>,
  id: string,
  timestamp: number | null
): NativeChatMessage | null {
  const role =
    item.type === 'UserMessage' ? 'user' : item.type === 'AgentMessage' ? 'assistant' : null
  if (!role) {
    return null
  }
  const blocks = codexCompletedMessageBlocks(item.content)
  return blocks.length > 0 ? { id, role, blocks, timestamp, source: 'transcript' } : null
}

function codexCompletedMessageBlocks(content: unknown): NativeChatBlock[] {
  if (!Array.isArray(content)) {
    return []
  }
  const blocks: NativeChatBlock[] = []
  for (const value of content) {
    const item = asRecord(value)
    if (item?.type !== 'text' && item?.type !== 'Text') {
      continue
    }
    const text = extractString(item.text)
    if (text) {
      blocks.push({ type: 'text', text })
    }
  }
  return blocks
}

function codexCallInput(payload: Record<string, unknown>): unknown {
  if (payload.arguments !== undefined) {
    return payload.arguments
  }
  return payload.input ?? payload.action ?? null
}

function codexToolResult(output: unknown, callId: string | null): NativeChatBlock {
  const record = asRecord(output)
  const outputSegments = codexOutputSegments(output)
  const isError =
    record?.success === false || record?.is_error === true || hasFailedExecution(output)
  return {
    type: 'tool-result',
    output: toolResultOutput(record?.content ?? record?.output ?? output),
    ...(isError ? { isError: true } : {}),
    ...(callId ? { callId } : {}),
    ...(outputSegments.length > 0 ? { outputSegments } : {})
  }
}

function codexOutputSegments(output: unknown): string[] {
  if (!Array.isArray(output)) {
    return []
  }
  const segments: string[] = []
  for (const item of output) {
    const record = asRecord(item)
    const text = extractString(record?.text) ?? extractString(record?.content)
    if (text) {
      segments.push(text)
    }
  }
  return /^Script (?:completed|failed)\b/.test(segments[0] ?? '') ? segments.slice(1) : segments
}

function hasFailedExecution(value: unknown): boolean {
  if (typeof value === 'string') {
    if (/^Script failed\b/m.test(value) || /Process exited[^\n]*\b[1-9]\d*\b/i.test(value)) {
      return true
    }
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed !== value && hasFailedExecution(parsed)
    } catch {
      return /["']exit_code["']\s*:\s*[1-9]\d*/.test(value)
    }
  }
  if (Array.isArray(value)) {
    return value.some(hasFailedExecution)
  }
  const record = asRecord(value)
  if (!record) {
    return false
  }
  if (typeof record.exit_code === 'number' && record.exit_code !== 0) {
    return true
  }
  return (
    hasFailedExecution(record.text) ||
    hasFailedExecution(record.content) ||
    hasFailedExecution(record.output)
  )
}

function codexSummaryText(summary: unknown): string | null {
  if (!Array.isArray(summary)) {
    return null
  }
  const parts: string[] = []
  for (const item of summary) {
    const text = extractString(asRecord(item)?.text) ?? extractString(item)
    if (text) {
      parts.push(text)
    }
  }
  return parts.length ? parts.join('\n') : null
}

function parseTimestamp(value: unknown): number | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? parsed : null
}
