import { createHash } from 'node:crypto'
import type { ExecutionHostId } from '../../shared/execution-host'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolLiveSessionCandidate,
  SpoolSessionProvider,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolProvenanceProvider } from './spool-session-provenance-index'

export type SpoolSessionCatalogDescription = {
  sessionKey: string
  provider: SpoolSessionProvider
  title: string
}

export type SpoolResolvedLiveSession = {
  kind: 'live'
  sessionKey: string
  terminalHandle: string
  executionHostId: ExecutionHostId
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: SpoolSessionProvider
  providerSessionId: string | null
  title: string
}

export type SpoolResolvedHistoricalSession = {
  kind: 'historical'
  sessionKey: string
  ownerRecordKey: string
  executionHostId: ExecutionHostId
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: SpoolProvenanceProvider
  providerSessionId: string
  title: string
}

export type SpoolResolvedSession = SpoolResolvedLiveSession | SpoolResolvedHistoricalSession

export function resolveLiveSession(
  worktree: SpoolSessionWorktreeIdentity,
  candidate: SpoolLiveSessionCandidate
): SpoolResolvedLiveSession {
  return {
    kind: 'live',
    sessionKey: candidate.providerSessionId
      ? providerSessionKey(worktree, candidate)
      : liveSessionKey(worktree, candidate),
    terminalHandle: candidate.terminalHandle,
    executionHostId: candidate.executionHostId,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    provider: candidate.provider,
    providerSessionId: candidate.providerSessionId,
    title: candidate.title
  }
}

export function resolveHistoricalSession(
  worktree: SpoolSessionWorktreeIdentity,
  candidate: SpoolHistoricalSessionCandidate
): SpoolResolvedHistoricalSession {
  return {
    kind: 'historical',
    sessionKey: providerSessionKey(worktree, candidate),
    ownerRecordKey: candidate.ownerRecordKey,
    executionHostId: candidate.executionHostId,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    provider: candidate.provider,
    providerSessionId: candidate.providerSessionId,
    title: candidate.title
  }
}

export function sessionDedupeKey(session: SpoolResolvedSession): string {
  if (session.kind === 'live' && !session.providerSessionId) {
    return JSON.stringify([session.executionHostId, session.kind, session.terminalHandle])
  }
  return JSON.stringify([session.executionHostId, session.provider, session.providerSessionId])
}

export function toSessionDescription(
  session: SpoolResolvedSession
): SpoolSessionCatalogDescription {
  return {
    sessionKey: session.sessionKey,
    provider: session.provider,
    title: session.title
  }
}

function providerSessionKey(
  worktree: SpoolSessionWorktreeIdentity,
  session: Pick<SpoolResolvedSession, 'executionHostId' | 'provider' | 'providerSessionId'>
): string {
  return hashSessionKey([
    'provider',
    worktree.instanceId,
    worktree.spoolIncarnationId,
    session.executionHostId,
    session.provider,
    session.providerSessionId
  ])
}

function liveSessionKey(
  worktree: SpoolSessionWorktreeIdentity,
  session: Pick<SpoolLiveSessionCandidate, 'executionHostId' | 'terminalHandle'>
): string {
  return hashSessionKey([
    'live',
    worktree.instanceId,
    worktree.spoolIncarnationId,
    session.executionHostId,
    session.terminalHandle
  ])
}

function hashSessionKey(parts: readonly (string | null)[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url')
}
