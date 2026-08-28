import { closeSync, openSync, readSync, statSync } from 'node:fs'

import { findGrokChatHistoryBySessionId } from '../grok/session-paths'
import { isAntigravityStopStillBusy } from './hook-event-other'
import { readGrokSessionMetadata } from './hook-grok-history'
import type { AgentHookSource } from './hook-relay'
import { isGrokEvent } from './hook-tool-command-grok'
import {
  TRANSCRIPT_CHUNK_BYTES,
  TRANSCRIPT_MAX_SCAN_BYTES,
  EMPTY_TRANSCRIPT_REGION,
  extractAssistantTextFromLine
} from './hook-transcript-claude'
import { parseHookBodyPayloadRecord, readGrokHomeEnvelope } from './hook-transcript-command-code'

export function hasPendingAgentResultText(source: AgentHookSource, body: unknown): boolean {
  const envelope =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  const record = parseHookBodyPayloadRecord(body)
  if (!record) {
    return false
  }
  if (hasExplicitLastAssistantResult(record)) {
    return false
  }
  if (source === 'copilot') {
    // Why: Copilot Stop consumes generic `message` as its final assistant text;
    // Grok and Antigravity use that field for status text instead.
    if (hasNonEmptyString(record.message)) {
      return false
    }
    const transcriptPath = record.transcript_path ?? record.transcriptPath
    return typeof transcriptPath === 'string' && transcriptPath.trim().length > 0
  }
  const eventName =
    envelope?.hook_event_name ??
    envelope?.hookEventName ??
    record.hook_event_name ??
    record.hookEventName
  if (source === 'antigravity' && eventName === 'Stop') {
    if (isAntigravityStopStillBusy(record)) {
      return false
    }
    const transcriptPath = record.transcriptPath ?? record.transcript_path
    return typeof transcriptPath === 'string' && transcriptPath.trim().length > 0
  }
  const pendingGrokDiscovery = preparePendingGrokResultDiscovery(source, body)
  if (pendingGrokDiscovery) {
    void pendingGrokDiscovery
    return true
  }
  return false
}

export function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function hasExplicitLastAssistantResult(record: Record<string, unknown>): boolean {
  return (
    hasNonEmptyString(record.last_assistant_message) ||
    hasNonEmptyString(record.lastAssistantMessage)
  )
}

/** Start bounded discovery only for a Grok completion that still needs result text. */
export function preparePendingGrokResultDiscovery(
  source: AgentHookSource,
  body: unknown
): Promise<void> | null {
  if (source !== 'grok') {
    return null
  }
  const envelope =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  const record = parseHookBodyPayloadRecord(body)
  if (!record || hasExplicitLastAssistantResult(record)) {
    return null
  }
  const eventName =
    envelope?.hook_event_name ??
    envelope?.hookEventName ??
    record.hook_event_name ??
    record.hookEventName
  if (!isGrokEvent(eventName, 'stop', 'session_end')) {
    return null
  }
  const metadata = readGrokSessionMetadata(
    record,
    envelope ? readGrokHomeEnvelope(envelope) : undefined
  )
  if (!metadata) {
    return null
  }
  // Why: the server can await this signal without moving filesystem discovery
  // back into the synchronous hook normalization path.
  return findGrokChatHistoryBySessionId(metadata.sessionsDir, metadata.sessionId).then(
    () => undefined
  )
}

export function readLastAssistantFromTranscriptOnce(transcriptPath: string): string | undefined {
  return readLastTextFromTranscriptOnce(transcriptPath, extractAssistantTextFromLine)
}

export function readLastTextFromTranscriptOnce(
  transcriptPath: string,
  extractLineText: (line: string) => string | undefined
): string | undefined {
  try {
    const stats = statSync(transcriptPath)
    const size = stats.size
    if (size <= 0) {
      return undefined
    }
    const fd = openSync(transcriptPath, 'r')
    try {
      // Why: joining a partial oversized line on every block is quadratic.
      let carryChunks: Buffer[] = []
      let bytesRead = 0
      let scanEnd = size
      while (scanEnd > 0 && bytesRead < TRANSCRIPT_MAX_SCAN_BYTES) {
        const chunkSize = Math.min(scanEnd, TRANSCRIPT_CHUNK_BYTES)
        const position = scanEnd - chunkSize
        const buffer = Buffer.alloc(chunkSize)
        let filled = 0
        while (filled < chunkSize) {
          const n = readSync(fd, buffer, filled, chunkSize - filled, position + filled)
          if (n === 0) {
            break
          }
          filled += n
        }
        if (filled < chunkSize) {
          break
        }
        bytesRead += filled
        scanEnd = position
        const firstNewline = buffer.indexOf(0x0a)
        const atStart = position === 0
        let completeRegion: Buffer
        if (atStart) {
          completeRegion =
            carryChunks.length === 0 ? buffer : Buffer.concat([buffer, ...carryChunks])
          carryChunks = []
        } else if (firstNewline === -1) {
          completeRegion = EMPTY_TRANSCRIPT_REGION
          carryChunks.unshift(buffer)
        } else {
          const afterNewline = buffer.subarray(firstNewline + 1)
          completeRegion =
            carryChunks.length === 0 ? afterNewline : Buffer.concat([afterNewline, ...carryChunks])
          carryChunks = [buffer.subarray(0, firstNewline)]
        }
        if (completeRegion.length > 0) {
          const extracted = findLastExtractedTranscriptLineText(
            completeRegion.toString('utf8'),
            extractLineText
          )
          if (extracted !== undefined) {
            return extracted
          }
        }
      }
      return undefined
    } finally {
      closeSync(fd)
    }
  } catch {
    return undefined
  }
}

export function findLastExtractedTranscriptLineText(
  text: string,
  extractLineText: (line: string) => string | undefined
): string | undefined {
  let lineEnd = text.length

  for (let index = text.length - 1; index >= -1; index--) {
    if (index >= 0 && text.charCodeAt(index) !== 10) {
      continue
    }

    const line = text.slice(index + 1, lineEnd).trim()
    if (line.length > 0) {
      const extracted = extractLineText(line)
      if (extracted !== undefined) {
        return extracted
      }
    }
    lineEnd = index
  }

  return undefined
}
