import { createHash } from 'node:crypto'

import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { SpoolSessionCatalogIdentity } from '../../shared/spool/spool-catalog-contract'
import type { SpoolLiveSessionIdentity } from './spool-live-session-display-identity'
import type { SpoolProvenanceProvider } from './spool-session-provenance-index'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolLiveSessionCandidate,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'

const MAX_PROVIDED_SESSION_KEY_LENGTH = 512

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
  // Why: a type annotation does not strip runtime keys; explicitly projecting
  // identity prevents an observed sessionKey from overwriting the validated key below.
  const identity: SpoolLiveSessionIdentity = {
    provider: candidate.provider,
    providerSessionId: candidate.providerSessionId,
    ...(candidate.sessionKind === 'terminal'
      ? { sessionKind: 'terminal', agent: null }
      : { sessionKind: 'agent', agent: candidate.agent })
  }
  return {
    kind: 'live',
    sessionKey:
      normalizeProvidedSessionKey(candidate.sessionKey) ??
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
    sessionKey:
      normalizeProvidedSessionKey(candidate.sessionKey) ?? providerSessionKey(worktree, candidate),
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

function normalizeProvidedSessionKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > MAX_PROVIDED_SESSION_KEY_LENGTH) {
    return null
  }
  for (const character of trimmed) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) {
      return null
    }
  }
  return trimmed
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
