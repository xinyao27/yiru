import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  buildGrokChatHistoryPathCandidates,
  getCachedGrokChatHistoryBySessionId,
  GROK_SESSION_ID_MAX_LENGTH,
  isSafeGrokSessionId,
  resolveGrokChatHistoryPathSync,
  resolveGrokSessionsDir
} from '../grok/session-paths'
import { readLastAssistantFromTranscriptOnce } from './hook-pending-result'
import { GROK_SESSION_CWD_MAX_LENGTH } from './hook-transcript-claude'
import { readBoundedString } from './hook-transcript-command-code'

export type GrokSessionMetadata = {
  sessionId: string
  cwd?: string
  sessionsDir: string
}

export function readGrokSessionMetadata(
  hookPayload: Record<string, unknown>,
  grokHome?: string
): GrokSessionMetadata | undefined {
  const sessionId = readBoundedString(
    hookPayload,
    ['sessionId', 'session_id'],
    GROK_SESSION_ID_MAX_LENGTH
  )
  if (!sessionId || !isSafeGrokSessionId(sessionId)) {
    return undefined
  }
  const cwd = readBoundedString(
    hookPayload,
    ['cwd', 'workspaceRoot', 'workspace_root'],
    GROK_SESSION_CWD_MAX_LENGTH
  )
  // Why: hook scripts report the effective per-PTY/remote home; old scripts
  // fall back to the listener runtime's Grok home for compatibility.
  const sessionsDir = grokHome
    ? join(grokHome, 'sessions')
    : resolveGrokSessionsDir(process.env, homedir())
  return { sessionId, cwd, sessionsDir }
}

export function getGrokChatHistoryPath(
  hookPayload: Record<string, unknown>,
  grokHome?: string
): string | undefined {
  const metadata = readGrokSessionMetadata(hookPayload, grokHome)
  if (!metadata) {
    return undefined
  }
  const resolved = resolveGrokChatHistoryPathSync({
    sessionId: metadata.sessionId,
    cwd: metadata.cwd ?? null,
    sessionsDir: metadata.sessionsDir
  })
  if (resolved) {
    return resolved
  }
  const cached = getCachedGrokChatHistoryBySessionId(metadata.sessionsDir, metadata.sessionId)
  if (cached) {
    return cached
  }
  // Why: hasPendingAgentResultText only needs a plausible on-disk target when
  // the file may not exist yet (SessionEnd can race the last write). Prefer a
  // short-cwd candidate when available; async discovery caches slug groups.
  if (!metadata.cwd) {
    return undefined
  }
  return (
    buildGrokChatHistoryPathCandidates({
      sessionId: metadata.sessionId,
      cwd: metadata.cwd,
      sessionsDir: metadata.sessionsDir
    })[0] ?? undefined
  )
}

export function readLastAssistantFromGrokChatHistory(
  hookPayload: Record<string, unknown>,
  grokHome?: string
): string | undefined {
  const chatHistoryPath = getGrokChatHistoryPath(hookPayload, grokHome)
  if (!chatHistoryPath) {
    return undefined
  }
  return readLastAssistantFromTranscriptOnce(chatHistoryPath)
}
