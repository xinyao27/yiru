import { createHash } from 'node:crypto'

import type { AiVaultSession } from '@yiru/workbench-model/agent'

import type { CoworkingAgentLaunchId } from '../../shared/coworking/agent-launch-contract'
import type { CoworkingLiveSessionIdentity } from './live-session-display-identity'
import type {
  CoworkingExecutionHostSessionReadRequest,
  CoworkingSessionClientTab
} from './session-source'

export function projectPairedRuntimeLiveTab(
  session: {
    terminalRef: string
    title: string
    isActive: boolean
    provider: 'claude' | 'codex' | 'other'
    providerSessionId: string | null
    sessionKind: 'terminal' | 'agent'
    agent: CoworkingAgentLaunchId | null
    sessionKey: string | null
  },
  worktreeInstanceId: string
): CoworkingSessionClientTab {
  const id = `coworking-paired-${shortHash(session.terminalRef)}`
  const identity: CoworkingLiveSessionIdentity =
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
    coworkingSessionKey: session.sessionKey,
    coworkingLiveSessionIdentity: identity
  }
}

export function projectPairedRuntimeHistoricalSession(
  request: CoworkingExecutionHostSessionReadRequest,
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
