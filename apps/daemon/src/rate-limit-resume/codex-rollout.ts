import { open, stat } from 'node:fs/promises'

import type {
  CodexUsageLimitProbe,
  RateLimitResumeWindow
} from '@yiru/runtime-protocol/workbench/rate-limit-resume/types'
import { resolveSessionFilePath } from '~main/runtime/orchestration/agent-transcript/session-file-resolver'

const ROLLOUT_TAIL_BYTES = 512 * 1024
const EXHAUSTED_PERCENT = 100

type CodexUsageLimitEvent = {
  detectedAt: number
  resetsAt: number | null
  window: RateLimitResumeWindow | null
}

type StructuredRecord = Record<string, unknown>

function record(value: unknown): StructuredRecord | null {
  return typeof value === 'object' && value !== null ? (value as StructuredRecord) : null
}

function stringField(value: StructuredRecord, snake: string, camel: string): string | null {
  const field = value[snake] ?? value[camel]
  return typeof field === 'string' ? field : null
}

function numberField(value: StructuredRecord, snake: string, camel: string): number | null {
  const field = value[snake] ?? value[camel]
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}

function parseLine(line: string): StructuredRecord | null {
  try {
    return record(JSON.parse(line))
  } catch {
    return null
  }
}

function payloadOf(entry: StructuredRecord): StructuredRecord | null {
  return record(entry.payload)
}

function isMatchingUsageLimitCompletion(payload: StructuredRecord, turnId: string): boolean {
  const type = stringField(payload, 'type', 'type')
  if (type !== 'task_complete' && type !== 'turn_complete') {
    return false
  }
  if (stringField(payload, 'turn_id', 'turnId') !== turnId) {
    return false
  }
  const error = record(payload.error)
  return (
    error !== null &&
    stringField(error, 'codex_error_info', 'codexErrorInfo') === 'usage_limit_exceeded'
  )
}

function exhaustedWindow(
  raw: unknown,
  window: RateLimitResumeWindow
): { resetsAt: number; window: RateLimitResumeWindow } | null {
  const value = record(raw)
  if (!value || (numberField(value, 'used_percent', 'usedPercent') ?? 0) < EXHAUSTED_PERCENT) {
    return null
  }
  const resetsAtSeconds = numberField(value, 'resets_at', 'resetsAt')
  if (resetsAtSeconds === null) {
    return null
  }
  return { resetsAt: resetsAtSeconds * 1000, window }
}

function exhaustedReset(payload: StructuredRecord): {
  resetsAt: number
  window: RateLimitResumeWindow
} | null {
  if (stringField(payload, 'type', 'type') !== 'token_count') {
    return null
  }
  const limits = record(payload.rate_limits ?? payload.rateLimits)
  if (!limits) {
    return null
  }
  const candidates = [limits.primary, limits.secondary]
  let session: { resetsAt: number; window: RateLimitResumeWindow } | null = null
  let weekly: { resetsAt: number; window: RateLimitResumeWindow } | null = null
  for (const candidate of candidates) {
    const value = record(candidate)
    if (!value) {
      continue
    }
    const duration = numberField(value, 'window_minutes', 'windowDurationMins')
    if (duration === 10_080) {
      weekly ??= exhaustedWindow(value, 'weekly')
    } else if (duration === 300) {
      session ??= exhaustedWindow(value, 'session')
    }
  }
  // A weekly exhaustion keeps the account blocked after the shorter window rolls.
  return weekly ?? session
}

async function readTail(filePath: string): Promise<string[]> {
  const size = (await stat(filePath)).size
  const start = Math.max(0, size - ROLLOUT_TAIL_BYTES)
  const buffer = Buffer.allocUnsafe(size - start)
  const handle = await open(filePath, 'r')
  try {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    const lines = text.split('\n')
    if (start > 0) {
      lines.shift()
    }
    return lines
  } finally {
    await handle.close()
  }
}

export async function readCodexUsageLimitEvent(
  probe: CodexUsageLimitProbe
): Promise<CodexUsageLimitEvent | null> {
  const filePath = await resolveSessionFilePath('codex', probe.sessionId, {
    transcriptPath: probe.transcriptPath
  })
  if (!filePath) {
    return null
  }
  const lines = await readTail(filePath)
  let detectedAt: number | null = null
  let reset: { resetsAt: number; window: RateLimitResumeWindow } | null = null
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const entry = parseLine(lines[index] ?? '')
    const payload = entry ? payloadOf(entry) : null
    if (!entry || !payload) {
      continue
    }
    if (detectedAt === null) {
      if (!isMatchingUsageLimitCompletion(payload, probe.turnId)) {
        continue
      }
      const timestamp =
        typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN
      detectedAt = Number.isFinite(timestamp) ? timestamp : Date.now()
      continue
    }
    if (
      stringField(payload, 'type', 'type') === 'task_started' &&
      stringField(payload, 'turn_id', 'turnId') === probe.turnId
    ) {
      break
    }
    reset ??= exhaustedReset(payload)
  }
  return detectedAt === null
    ? null
    : { detectedAt, resetsAt: reset?.resetsAt ?? null, window: reset?.window ?? null }
}
