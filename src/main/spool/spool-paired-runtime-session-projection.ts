import { createHash } from 'node:crypto'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { RuntimeMobileSessionTerminalClientTab } from '../../shared/runtime-types'
import type { SpoolExecutionHostSessionReadRequest } from './spool-session-source'

export function projectPairedRuntimeLiveTab(
  session: {
    terminalRef: string
    title: string
    provider: 'claude' | 'codex' | 'other'
    providerSessionId: string | null
  },
  worktreeInstanceId: string
): RuntimeMobileSessionTerminalClientTab {
  const id = `spool-paired-${shortHash(session.terminalRef)}`
  const knownProvider = session.provider === 'other' ? null : session.provider
  return {
    type: 'terminal',
    id,
    title: session.title,
    parentTabId: id,
    leafId: id,
    isActive: false,
    status: 'ready',
    terminal: session.terminalRef,
    worktreeInstanceId,
    ...(knownProvider ? { launchAgent: knownProvider } : {}),
    ...(knownProvider && session.providerSessionId
      ? {
          agentStatus: {
            state: 'done',
            prompt: '',
            updatedAt: 0,
            stateStartedAt: 0,
            agentType: knownProvider,
            paneKey: id,
            stateHistory: [],
            providerSession: { key: 'session_id', id: session.providerSessionId }
          }
        }
      : {})
  }
}

export function projectPairedRuntimeHistoricalSession(
  request: SpoolExecutionHostSessionReadRequest,
  scannedAt: string,
  session: {
    sessionRef: string
    title: string
    provider: 'claude' | 'codex'
    providerSessionId: string
    cwd: string | null
    transcriptPath: string
    resumeCommand: string
  }
): AiVaultSession {
  return {
    id: session.sessionRef,
    executionHostId: request.executionHostId,
    agent: session.provider,
    sessionId: session.providerSessionId,
    title: session.title,
    cwd: session.cwd,
    branch: null,
    model: null,
    // Why: these fields are consumed into the owner-only record store before projection.
    filePath: session.transcriptPath,
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: scannedAt,
    messageCount: 0,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: session.resumeCommand,
    subagent: null
  }
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 22)
}
