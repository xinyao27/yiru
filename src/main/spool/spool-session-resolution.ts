import { createHash } from 'node:crypto'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { SpoolSessionCatalogIdentity } from '../../shared/spool/spool-catalog-contract'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolLiveSessionCandidate,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolProvenanceProvider } from './spool-session-provenance-index'
import type { SpoolLiveSessionIdentity } from './spool-live-session-display-identity'

export type SpoolSessionCatalogDescription = {
  sessionKey: string
  title: string
} & SpoolSessionCatalogIdentity

export type SpoolResolvedLiveSession = {
  kind: 'live'
  sessionKey: string
  terminalHandle: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  title: string
} & SpoolLiveSessionIdentity

export type SpoolResolvedHistoricalSession = {
  kind: 'historical'
  sessionKey: string
  ownerRecordKey: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: SpoolProvenanceProvider
  providerSessionId: string
  sessionKind: 'agent'
  agent: SpoolProvenanceProvider
  title: string
}

export type SpoolResolvedSession = SpoolResolvedLiveSession | SpoolResolvedHistoricalSession

export function resolveLiveSession(
  worktree: SpoolSessionWorktreeIdentity,
  candidate: SpoolLiveSessionCandidate
): SpoolResolvedLiveSession {
  const identity: SpoolLiveSessionIdentity = candidate
  return {
    kind: 'live',
    sessionKey:
      candidate.sessionKey ??
      (candidate.providerSessionId
        ? providerSessionKey(worktree, candidate)
        : spoolLiveTerminalSessionKey(worktree, candidate.terminalHandle)),
    terminalHandle: candidate.terminalHandle,
    executionHostId: candidate.executionHostId,
    actualHostScope: candidate.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    ...identity,
    title: candidate.title
  }
}

export function resolveHistoricalSession(
  worktree: SpoolSessionWorktreeIdentity,
  candidate: SpoolHistoricalSessionCandidate
): SpoolResolvedHistoricalSession {
  return {
    kind: 'historical',
    sessionKey: candidate.sessionKey ?? providerSessionKey(worktree, candidate),
    ownerRecordKey: candidate.ownerRecordKey,
    executionHostId: candidate.executionHostId,
    actualHostScope: candidate.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    provider: candidate.provider,
    providerSessionId: candidate.providerSessionId,
    sessionKind: 'agent',
    agent: candidate.provider,
    title: candidate.title
  }
}

export function sessionDedupeKey(session: SpoolResolvedSession): string {
  if (session.kind === 'live' && !session.providerSessionId) {
    return JSON.stringify([session.actualHostScope, session.kind, session.terminalHandle])
  }
  return JSON.stringify([session.actualHostScope, session.provider, session.providerSessionId])
}

export function toSessionDescription(
  session: SpoolResolvedSession
): SpoolSessionCatalogDescription {
  return session.sessionKind === 'terminal'
    ? { sessionKey: session.sessionKey, kind: 'terminal', agent: null, title: session.title }
    : {
        sessionKey: session.sessionKey,
        kind: 'agent',
        agent: session.agent,
        title: session.title
      }
}

function providerSessionKey(
  worktree: SpoolSessionWorktreeIdentity,
  session: Pick<SpoolResolvedSession, 'actualHostScope' | 'provider' | 'providerSessionId'>
): string {
  return hashSessionKey([
    'provider',
    worktree.instanceId,
    worktree.spoolIncarnationId,
    session.actualHostScope,
    session.provider,
    session.providerSessionId
  ])
}

export function spoolLiveTerminalSessionKey(
  worktree: Pick<
    SpoolSessionWorktreeIdentity,
    'instanceId' | 'spoolIncarnationId' | 'actualHostScope'
  >,
  terminalHandle: string
): string {
  return hashSessionKey([
    'live',
    worktree.instanceId,
    worktree.spoolIncarnationId,
    worktree.actualHostScope,
    terminalHandle
  ])
}

function hashSessionKey(parts: readonly (string | null)[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url')
}
