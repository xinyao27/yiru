import { createHash } from 'node:crypto'

import {
  readLastAssistantFromTranscriptOnce,
  readLastTextFromTranscriptOnce
} from './hook-pending-result'

export const TRANSCRIPT_CHUNK_BYTES = 64 * 1024
export const TRANSCRIPT_MAX_SCAN_BYTES = 4 * 1024 * 1024
export const EMPTY_TRANSCRIPT_REGION = Buffer.alloc(0)
export const AMP_THREAD_ID_MAX_LENGTH = 256
export const AMP_MAX_SCOPED_THREAD_CACHE_KEYS = 32
export const GROK_SESSION_CWD_MAX_LENGTH = 4096
export const GROK_HOME_ENVELOPE_MAX_LENGTH = 4096

export function extractAssistantTextFromLine(line: string): string | undefined {
  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof entry !== 'object' || entry === null) {
    return undefined
  }
  const record = entry as Record<string, unknown>
  if (record.type === 'assistant.message') {
    const data = record.data
    if (typeof data === 'object' && data !== null) {
      const text = extractAssistantContentText((data as Record<string, unknown>).content)
      if (text) {
        return text
      }
    }
  }
  if (
    record.source === 'MODEL' &&
    record.type === 'PLANNER_RESPONSE' &&
    typeof record.content === 'string' &&
    record.content.trim().length > 0
  ) {
    return record.content
  }
  const nestedMessage = record.message as Record<string, unknown> | undefined
  const role =
    record.role ?? nestedMessage?.role ?? (record.type === 'assistant' ? 'assistant' : undefined)
  if (role !== 'assistant') {
    return undefined
  }
  const content = (nestedMessage ?? record).content
  return extractAssistantContentText(content)
}

export function extractAssistantContentText(content: unknown): string | undefined {
  if (typeof content === 'string' && content.trim().length > 0) {
    return content
  }
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

export function extractAntigravityUserRequest(content: string): string | undefined {
  const opener = '<USER_REQUEST>'
  const startIndex = content.indexOf(opener)
  const bodyStartIndex = startIndex === -1 ? -1 : startIndex + opener.length
  const endIndex = bodyStartIndex === -1 ? -1 : content.indexOf('</USER_REQUEST>', bodyStartIndex)
  const text =
    bodyStartIndex === -1 || endIndex === -1 ? content : content.slice(bodyStartIndex, endIndex)
  const trimmed = text.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function extractUserPromptTextFromLine(line: string): string | undefined {
  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof entry !== 'object' || entry === null) {
    return undefined
  }
  const record = entry as Record<string, unknown>
  if (
    (record.source === 'USER_EXPLICIT' || record.source === 'USER') &&
    (record.type === 'USER_INPUT' || record.type === 'REQUEST') &&
    typeof record.content === 'string'
  ) {
    return extractAntigravityUserRequest(record.content)
  }
  return undefined
}

export function readLastAssistantFromTranscript(transcriptPath: unknown): string | undefined {
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) {
    return undefined
  }
  return readLastAssistantFromTranscriptOnce(transcriptPath)
}

export function readLastUserPromptFromTranscript(transcriptPath: unknown): string | undefined {
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) {
    return undefined
  }
  return readLastTextFromTranscriptOnce(transcriptPath, extractUserPromptTextFromLine)
}

export function extractCommandCodeUserPromptFromLine(line: string): string | undefined {
  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof entry !== 'object' || entry === null) {
    return undefined
  }
  const record = entry as Record<string, unknown>
  return record.role === 'user' ? extractAssistantContentText(record.content) : undefined
}

export function hashInteractionKeyPart(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}
