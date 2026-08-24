import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

import { readLastTextFromTranscriptOnce } from './hook-pending-result'
import { readFirstString } from './hook-tool-preview'
import {
  TRANSCRIPT_MAX_SCAN_BYTES,
  GROK_HOME_ENVELOPE_MAX_LENGTH,
  extractAssistantContentText,
  extractCommandCodeUserPromptFromLine,
  hashInteractionKeyPart
} from './hook-transcript-claude'

export function readLastCommandCodeUserPromptEntryFromTranscript(
  transcriptPath: unknown
): { text: string; interactionKey: string } | undefined {
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) {
    return undefined
  }
  try {
    const stats = statSync(transcriptPath)
    const size = stats.size
    if (size <= 0) {
      return undefined
    }
    const bytesToRead = Math.min(size, TRANSCRIPT_MAX_SCAN_BYTES)
    const position = size - bytesToRead
    const fd = openSync(transcriptPath, 'r')
    try {
      const buffer = Buffer.alloc(bytesToRead)
      let filled = 0
      while (filled < bytesToRead) {
        const n = readSync(fd, buffer, filled, bytesToRead - filled, position + filled)
        if (n === 0) {
          break
        }
        filled += n
      }
      let text = buffer.subarray(0, filled).toString('utf8')
      let textBasePosition = position
      if (position > 0) {
        const firstNewline = text.indexOf('\n')
        textBasePosition += firstNewline + 1
        text = firstNewline === -1 ? '' : text.slice(firstNewline + 1)
      }
      let lastPrompt: string | undefined
      let lastPromptOffset = 0
      for (const { line, byteOffset } of iterateTranscriptLinesWithByteOffsets(text)) {
        const prompt = extractCommandCodeUserPromptFromLine(line.trim())
        if (prompt !== undefined) {
          lastPrompt = prompt
          lastPromptOffset = textBasePosition + byteOffset
        }
      }
      return lastPrompt
        ? {
            text: lastPrompt,
            interactionKey: [
              'command-code-transcript',
              hashInteractionKeyPart(transcriptPath),
              String(lastPromptOffset),
              hashInteractionKeyPart(lastPrompt)
            ].join('-')
          }
        : undefined
    } finally {
      closeSync(fd)
    }
  } catch {
    return undefined
  }
}

function* iterateTranscriptLinesWithByteOffsets(
  text: string
): Generator<{ line: string; byteOffset: number }> {
  let lineStart = 0
  let byteOffset = 0

  for (let index = 0; index <= text.length; index++) {
    if (index < text.length && text.charCodeAt(index) !== 10) {
      continue
    }

    const line = text.slice(lineStart, index)
    yield { line, byteOffset }
    byteOffset += Buffer.byteLength(line, 'utf8') + (index < text.length ? 1 : 0)
    lineStart = index + 1
  }
}

export function extractCommandCodeAssistantTextFromLine(line: string): string | undefined {
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
  if (record.role !== 'assistant') {
    return undefined
  }
  const content = record.content
  if (typeof content === 'string' && content.trim().length > 0) {
    return content
  }
  if (Array.isArray(content)) {
    const textPart = content.find(
      (part) =>
        typeof part === 'object' &&
        part !== null &&
        (part as Record<string, unknown>).type === 'text' &&
        typeof (part as Record<string, unknown>).text === 'string' &&
        ((part as Record<string, unknown>).text as string).trim().length > 0
    ) as Record<string, unknown> | undefined
    if (typeof textPart?.text === 'string') {
      return textPart.text
    }
  }
  return extractAssistantContentText(content)
}

export function readLastCommandCodeAssistantFromTranscript(
  transcriptPath: unknown
): string | undefined {
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) {
    return undefined
  }
  return readLastTextFromTranscriptOnce(transcriptPath, extractCommandCodeAssistantTextFromLine)
}

export function parseHookBodyPayloadRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const rawPayload = (body as Record<string, unknown>).payload
  const payload =
    typeof rawPayload === 'string'
      ? (() => {
          try {
            return JSON.parse(rawPayload) as unknown
          } catch {
            return null
          }
        })()
      : rawPayload
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null
}

export function readBoundedString(
  record: Record<string, unknown>,
  keys: readonly string[],
  maxLength: number
): string | undefined {
  const value = readFirstString(record, keys)
  return value && value.length <= maxLength ? value : undefined
}

export function readGrokHomeEnvelope(record: Record<string, unknown>): string | undefined {
  const value = readBoundedString(record, ['grokHome'], GROK_HOME_ENVELOPE_MAX_LENGTH)
  if (!value || value !== value.trim() || !isAbsolute(value) || hasControlCharacter(value)) {
    return undefined
  }
  return value
}

export function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}
