import { basename, extname } from 'node:path'

import {
  aiVaultAgentLabel,
  buildAiVaultResumeCommand,
  type AiVaultAgent,
  type AiVaultSession,
  type AiVaultSessionDayTokens,
  type AiVaultSessionPreviewMessage,
  type AiVaultSessionTokenUsage
} from '@yiru/runtime-protocol/model/agent'
import { localCalendarDayKey } from '@yiru/runtime-protocol/model/ui'
import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'

import type { FileWithMtime, ResumableSessionParseState, SessionAccumulator } from './scanner-types'
import {
  extractPreviewContentText,
  extractString,
  normalizePreviewText,
  timestampMs
} from './scanner-values'

const SESSION_PREVIEW_MESSAGE_LIMIT = 5

export function createAccumulator(args: {
  agent: AiVaultAgent
  file: FileWithMtime
  sessionId: string
}): SessionAccumulator {
  return {
    agent: args.agent,
    sessionId: args.sessionId,
    title: null,
    fallbackTitle: null,
    cwd: null,
    branch: null,
    model: null,
    provider: null,
    filePath: args.file.path,
    createdAt: null,
    updatedAt: null,
    modifiedAt: args.file.modifiedAt,
    messageCount: 0,
    totalTokens: 0,
    tokensByDay: new Map(),
    tokenUsage: [],
    previewMessages: [],
    lastUserPrompt: null,
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    latestTimestampMs: 0
  }
}

export function cloneSessionAccumulator(accumulator: SessionAccumulator): SessionAccumulator {
  return {
    ...accumulator,
    previewMessages: [...accumulator.previewMessages],
    tokensByDay: new Map(accumulator.tokensByDay),
    tokenUsage: [...accumulator.tokenUsage]
  }
}

// Why: one write path keeps session totals and their calendar-day buckets from diverging.
export function addSessionTokens(
  accumulator: SessionAccumulator,
  tokens: number,
  timestamp?: unknown
): void {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return
  }
  accumulator.totalTokens += tokens

  const parsed = timestamp === undefined ? Number.NaN : timestampMs(timestamp)
  const at = Number.isFinite(parsed)
    ? parsed
    : accumulator.latestTimestampMs > 0
      ? accumulator.latestTimestampMs
      : Number.NaN
  if (!Number.isFinite(at)) {
    // Why: keep the known total, but never fabricate a heatmap day without a trustworthy time.
    return
  }
  const day = localCalendarDayKey(at)
  accumulator.tokensByDay.set(day, (accumulator.tokensByDay.get(day) ?? 0) + tokens)
}

export function addSessionTokenUsage(
  accumulator: SessionAccumulator,
  usage: Omit<AiVaultSessionTokenUsage, 'timestamp'> & { timestamp?: unknown }
): void {
  const totalTokens = Math.max(
    usage.totalTokens,
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  )
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return
  }
  addSessionTokens(accumulator, totalTokens, usage.timestamp)
  const parsed = usage.timestamp === undefined ? Number.NaN : timestampMs(usage.timestamp)
  accumulator.tokenUsage.push({
    provider: usage.provider,
    model: usage.model,
    timestamp: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    totalTokens
  })
}

function tokensByDayList(accumulator: SessionAccumulator): AiVaultSessionDayTokens[] {
  return [...accumulator.tokensByDay.entries()]
    .map(([day, tokens]) => ({ day, tokens }))
    .sort((left, right) => left.day.localeCompare(right.day))
}

// Resumable fold for parsers whose only parse state is the accumulator itself
// (cursor, copilot, droid, openclaw/pi, gemini-jsonl). Parsers with extra
// closure state (claude, codex) build their own ResumableSessionParseState.
export function accumulatorFoldResumeState(
  accumulator: SessionAccumulator,
  consumeRecordLine: (accumulator: SessionAccumulator, line: string) => void
): ResumableSessionParseState {
  return {
    consumeLine: (line) => consumeRecordLine(accumulator, line),
    clone: () =>
      accumulatorFoldResumeState(cloneSessionAccumulator(accumulator), consumeRecordLine),
    touchFile: (file) => {
      accumulator.modifiedAt = file.modifiedAt
    },
    // Finalize a snapshot: the live accumulator (and its preview array) keeps
    // accumulating appended lines after this session object is handed out.
    finalize: (platform, options) =>
      finalizeSession(cloneSessionAccumulator(accumulator), platform, options)
  }
}

export function finalizeSession(
  accumulator: SessionAccumulator,
  platform: NodeJS.Platform,
  options: {
    codexHome?: string | null
    executionHostId?: ExecutionHostId
    executionHostPlatform?: NodeJS.Platform | null
  } = {}
): AiVaultSession | null {
  const sessionId = accumulator.sessionId.trim()
  if (!sessionId) {
    return null
  }
  const title =
    accumulator.title ||
    accumulator.fallbackTitle ||
    `${aiVaultAgentLabel(accumulator.agent)} ${sessionId.slice(0, 8)}`

  const executionHostId = options.executionHostId ?? LOCAL_EXECUTION_HOST_ID

  return {
    id: `${executionHostId}:${accumulator.agent}:${sessionId}:${accumulator.filePath}`,
    executionHostId,
    ...(options.executionHostPlatform
      ? { executionHostPlatform: options.executionHostPlatform }
      : {}),
    agent: accumulator.agent,
    sessionId,
    title,
    cwd: accumulator.cwd,
    branch: accumulator.branch,
    model: accumulator.model,
    filePath: accumulator.filePath,
    codexHome: accumulator.agent === 'codex' ? (options.codexHome ?? null) : null,
    createdAt: accumulator.createdAt,
    updatedAt: accumulator.updatedAt,
    modifiedAt: accumulator.modifiedAt,
    messageCount: accumulator.messageCount,
    totalTokens: accumulator.totalTokens,
    ...(accumulator.tokensByDay.size > 0 ? { tokensByDay: tokensByDayList(accumulator) } : {}),
    ...(accumulator.tokenUsage.length > 0 ? { tokenUsage: [...accumulator.tokenUsage] } : {}),
    previewMessages: accumulator.previewMessages,
    ...(accumulator.lastUserPrompt ? { lastUserPrompt: accumulator.lastUserPrompt } : {}),
    queuedMessageCount: accumulator.queuedMessageCount,
    subagentTranscriptCount: accumulator.subagentTranscriptCount,
    resumeCommand: buildAiVaultResumeCommand({
      agent: accumulator.agent,
      sessionId,
      resumeFilePath: accumulator.filePath,
      cwd: accumulator.cwd,
      platform,
      codexHome: options.codexHome
    }),
    subagent: null
  }
}

export function updateTimeline(accumulator: SessionAccumulator, timestamp: unknown): void {
  const parsed = timestampMs(timestamp)
  if (!Number.isFinite(parsed)) {
    return
  }
  const iso = new Date(parsed).toISOString()
  if (!accumulator.createdAt || parsed < Date.parse(accumulator.createdAt)) {
    accumulator.createdAt = iso
  }
  if (!accumulator.updatedAt || parsed >= Date.parse(accumulator.updatedAt)) {
    accumulator.updatedAt = iso
    accumulator.latestTimestampMs = parsed
  }
}

export function addPreviewMessage(
  accumulator: SessionAccumulator,
  args: {
    role: AiVaultSessionPreviewMessage['role']
    text: string | null
    timestamp?: unknown
  }
): void {
  const text = normalizePreviewText(args.text ?? '')
  if (!text) {
    return
  }
  accumulator.previewMessages.push({
    role: args.role,
    text,
    timestamp: timestampIso(args.timestamp)
  })
  if (accumulator.previewMessages.length > SESSION_PREVIEW_MESSAGE_LIMIT) {
    accumulator.previewMessages.shift()
  }
}

export function addPreviewContent(
  accumulator: SessionAccumulator,
  role: AiVaultSessionPreviewMessage['role'],
  content: unknown,
  timestamp?: unknown
): void {
  addPreviewMessage(accumulator, {
    role,
    text: extractPreviewContentText(content),
    timestamp
  })
}

export function timestampIso(value: unknown): string | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export function updateLatestLocation(
  accumulator: SessionAccumulator,
  record: Record<string, unknown>
): void {
  // Why: Claude resolves resume ids under the project derived from the first
  // cwd, so later transcript cwd drift must not replace the session origin.
  if (accumulator.cwd === null) {
    const startCwd = extractString(record.cwd)
    if (startCwd) {
      accumulator.cwd = startCwd
    }
  }
  const timestamp = extractString(record.timestamp)
  const parsed = timestamp ? Date.parse(timestamp) : accumulator.latestTimestampMs
  if (!Number.isFinite(parsed) || parsed < accumulator.latestTimestampMs) {
    return
  }
  const branch = extractString(record.gitBranch)
  if (branch) {
    accumulator.branch = branch
  }
}

export function sessionSortTime(session: AiVaultSession): number {
  return Date.parse(session.updatedAt ?? session.modifiedAt)
}

export function sessionIdFromFileName(filePath: string): string {
  const fileName = basename(filePath, extname(filePath))
  const match = fileName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  return match?.[0] ?? fileName
}
