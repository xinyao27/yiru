import { createHash } from 'node:crypto'

import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { CoworkingSessionCatalogIdentity } from '~shared/coworking/catalog-contract'

import type { CoworkingLiveSessionIdentity } from '../live-session-display-identity'
import type { CoworkingProvenanceProvider } from './provenance-index'
import type {
  CoworkingHistoricalSessionCandidate,
  CoworkingLiveSessionCandidate,
  CoworkingSessionWorktreeIdentity
} from './source'

const MAX_PROVIDED_SESSION_KEY_LENGTH = 512

export type CoworkingSessionCatalogDescription = {
  sessionKey: string
  title: string
} & CoworkingSessionCatalogIdentity

export type CoworkingResolvedLiveSession = {
  kind: 'live'
  sessionKey: string
  terminalHandle: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  coworkingIncarnationId: string
  title: string
} & CoworkingLiveSessionIdentity

export type CoworkingResolvedHistoricalSession = {
  kind: 'historical'
  sessionKey: string
  ownerRecordKey: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  coworkingIncarnationId: string
  provider: CoworkingProvenanceProvider
  providerSessionId: string
  sessionKind: 'agent'
  agent: CoworkingProvenanceProvider
  title: string
}

export type CoworkingResolvedSession =
  | CoworkingResolvedLiveSession
  | CoworkingResolvedHistoricalSession

export function resolveLiveSession(
  worktree: CoworkingSessionWorktreeIdentity,
  candidate: CoworkingLiveSessionCandidate
): CoworkingResolvedLiveSession {
  // Why: a type annotation does not strip runtime keys; explicitly projecting
  // identity prevents an observed sessionKey from overwriting the validated key below.
  const identity: CoworkingLiveSessionIdentity = {
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
        : coworkingLiveTerminalSessionKey(worktree, candidate.terminalHandle)),
    terminalHandle: candidate.terminalHandle,
    executionHostId: candidate.executionHostId,
    actualHostScope: candidate.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    coworkingIncarnationId: worktree.coworkingIncarnationId,
    ...identity,
    title: candidate.title
  }
}

export function resolveHistoricalSession(
  worktree: CoworkingSessionWorktreeIdentity,
  candidate: CoworkingHistoricalSessionCandidate
): CoworkingResolvedHistoricalSession {
  return {
    kind: 'historical',
    sessionKey:
      normalizeProvidedSessionKey(candidate.sessionKey) ?? providerSessionKey(worktree, candidate),
    ownerRecordKey: candidate.ownerRecordKey,
    executionHostId: candidate.executionHostId,
    actualHostScope: candidate.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    coworkingIncarnationId: worktree.coworkingIncarnationId,
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

export function sessionDedupeKey(session: CoworkingResolvedSession): string {
  if (session.kind === 'live' && !session.providerSessionId) {
    return JSON.stringify([session.actualHostScope, session.kind, session.terminalHandle])
  }
  return JSON.stringify([session.actualHostScope, session.provider, session.providerSessionId])
}

export function toSessionDescription(
  session: CoworkingResolvedSession
): CoworkingSessionCatalogDescription {
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
  worktree: CoworkingSessionWorktreeIdentity,
  session: Pick<CoworkingResolvedSession, 'actualHostScope' | 'provider' | 'providerSessionId'>
): string {
  return hashSessionKey([
    'provider',
    worktree.instanceId,
    worktree.coworkingIncarnationId,
    session.actualHostScope,
    session.provider,
    session.providerSessionId
  ])
}

export function coworkingLiveTerminalSessionKey(
  worktree: Pick<
    CoworkingSessionWorktreeIdentity,
    'instanceId' | 'coworkingIncarnationId' | 'actualHostScope'
  >,
  terminalHandle: string
): string {
  return hashSessionKey([
    'live',
    worktree.instanceId,
    worktree.coworkingIncarnationId,
    worktree.actualHostScope,
    terminalHandle
  ])
}

function hashSessionKey(parts: readonly (string | null)[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url')
}
