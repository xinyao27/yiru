import { createHash } from 'node:crypto'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { SpoolAgentLaunchId } from '../../shared/spool/spool-agent-launch-contract'
import type {
  SpoolExecutionHostSessionReadRequest,
  SpoolSessionClientTab
} from './spool-session-source'
import type { SpoolLiveSessionIdentity } from './spool-live-session-display-identity'

export function projectPairedRuntimeLiveTab(
  session: {
    terminalRef: string
    title: string
    isActive: boolean
    provider: 'claude' | 'codex' | 'other'
    providerSessionId: string | null
    sessionKind: 'terminal' | 'agent'
    agent: SpoolAgentLaunchId | null
    sessionKey: string | null
  },
  worktreeInstanceId: string
): SpoolSessionClientTab {
  const id = `spool-paired-${shortHash(session.terminalRef)}`
  const identity: SpoolLiveSessionIdentity =
    session.sessionKind === 'terminal'
      ? { provider: 'other', providerSessionId: null, sessionKind: 'terminal', agent: null }
      : {
          provider: session.provider,
          providerSessionId: session.providerSessionId,
          sessionKind: 'agent',
          agent: session.agent
        }
  return {
    type: 'terminal',
    id,
    title: session.title,
    parentTabId: id,
    leafId: id,
    isActive: session.isActive,
    status: 'ready',
    terminal: session.terminalRef,
    worktreeInstanceId,
    spoolSessionKey: session.sessionKey,
    spoolLiveSessionIdentity: identity
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
