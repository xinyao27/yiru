import { normalizeExecutionHostId } from '../../shared/execution-host'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolHistoricalSessionConsistency,
  SpoolLiveSessionCandidate,
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type {
  SpoolProvenanceProvider,
  SpoolSessionProvenance,
  SpoolSessionProvenanceIndex
} from './spool-session-provenance-index'
import {
  resolveHistoricalSession,
  resolveLiveSession,
  sessionDedupeKey,
  toSessionDescription,
  type SpoolResolvedHistoricalSession,
  type SpoolResolvedSession,
  type SpoolSessionCatalogDescription
} from './spool-session-resolution'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

export type {
  SpoolResolvedHistoricalSession,
  SpoolResolvedLiveSession,
  SpoolResolvedSession,
  SpoolSessionCatalogDescription
} from './spool-session-resolution'

export class SpoolSessionCatalog {
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribeSource: () => void

  constructor(
    private readonly provenance: SpoolSessionProvenanceIndex,
    private readonly source: SpoolSessionSource,
    private readonly historicalConsistency: SpoolHistoricalSessionConsistency,
    private readonly onListenerError: (error: unknown) => void = defaultListenerError
  ) {
    this.unsubscribeSource = source.subscribe?.(() => this.emitChange()) ?? (() => {})
  }

  async listSessions(
    instance: SpoolPublicWorktreeInstance
  ): Promise<readonly SpoolSessionCatalogDescription[]> {
    return (await this.resolveAll(instance)).map(toSessionDescription)
  }

  async resolveSession(
    instance: SpoolPublicWorktreeInstance,
    sessionKey: string
  ): Promise<SpoolResolvedSession | null> {
    const sessions = await this.resolveAll(instance)
    return sessions.find((session) => session.sessionKey === sessionKey) ?? null
  }

  resolveHistoricalRecord(
    session: SpoolResolvedHistoricalSession
  ): SpoolOwnerHistoricalSessionRecord | null {
    const record = this.source.resolveOwnerHistoricalRecord(session.ownerRecordKey)
    return record &&
      record.executionHostId === session.executionHostId &&
      record.worktreeInstanceId === session.worktreeInstanceId &&
      record.spoolIncarnationId === session.spoolIncarnationId &&
      record.provider === session.provider &&
      record.providerSessionId === session.providerSessionId
      ? record
      : null
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  recordProvenProviderSession(
    worktree: SpoolSessionWorktreeIdentity,
    provider: SpoolProvenanceProvider,
    providerSessionId: string
  ): void {
    requireExactWorktreeIdentity(worktree)
    const changed = this.provenance.attest([
      {
        executionHostId: worktree.target.executionHostId,
        provider,
        providerSessionId,
        worktreeInstanceId: worktree.instanceId,
        spoolIncarnationId: worktree.spoolIncarnationId
      }
    ])
    if (changed) {
      this.emitChange()
    }
  }

  close(): void {
    this.unsubscribeSource()
    this.listeners.clear()
  }

  private async resolveAll(
    instance: SpoolPublicWorktreeInstance
  ): Promise<readonly SpoolResolvedSession[]> {
    const worktree = toSessionWorktree(instance)
    requireExactWorktreeIdentity(worktree)
    const [live, historical] = await Promise.all([
      this.source.listLiveSessions(worktree),
      this.source.listHistoricalSessions(worktree, 'catalog')
    ])
    const liveSessions = live.filter((candidate) => hasExactLiveBinding(worktree, candidate))
    this.attestProviderSessions(worktree, liveSessions)
    const provenHistorical = historical
      .map((candidate) => ({
        candidate,
        resolved: this.resolveHistoricalSession(worktree, candidate)
      }))
      .filter(
        (
          entry
        ): entry is {
          candidate: SpoolHistoricalSessionCandidate
          resolved: SpoolResolvedHistoricalSession
        } => entry.resolved !== null
      )
    const consistentHistorical = new Set(
      await this.historicalConsistency.retainConsistent(
        worktree,
        provenHistorical.map((entry) => entry.candidate)
      )
    )

    const sessions = new Map<string, SpoolResolvedSession>()
    const dedupeKeys = new Set<string>()
    for (const candidate of liveSessions) {
      const resolved = resolveLiveSession(worktree, candidate)
      const dedupeKey = sessionDedupeKey(resolved)
      if (!dedupeKeys.has(dedupeKey)) {
        dedupeKeys.add(dedupeKey)
        sessions.set(resolved.sessionKey, resolved)
      }
    }
    for (const { candidate, resolved } of provenHistorical) {
      if (!consistentHistorical.has(candidate)) {
        continue
      }
      const dedupeKey = sessionDedupeKey(resolved)
      if (!dedupeKeys.has(dedupeKey)) {
        dedupeKeys.add(dedupeKey)
        sessions.set(resolved.sessionKey, resolved)
      }
    }
    return [...sessions.values()]
  }

  private attestProviderSessions(
    worktree: SpoolSessionWorktreeIdentity,
    sessions: readonly SpoolLiveSessionCandidate[]
  ): void {
    const entries: SpoolSessionProvenance[] = []
    for (const session of sessions) {
      if (
        (session.provider === 'claude' || session.provider === 'codex') &&
        session.providerSessionId
      ) {
        entries.push({
          executionHostId: worktree.target.executionHostId,
          provider: session.provider,
          providerSessionId: session.providerSessionId,
          worktreeInstanceId: worktree.instanceId,
          spoolIncarnationId: worktree.spoolIncarnationId
        })
      }
    }
    // Why: a proven live binding becomes the durable proof used after the terminal exits.
    if (this.provenance.attest(entries)) {
      this.emitChange()
    }
  }

  private resolveHistoricalSession(
    worktree: SpoolSessionWorktreeIdentity,
    candidate: SpoolHistoricalSessionCandidate
  ): SpoolResolvedHistoricalSession | null {
    if (candidate.executionHostId !== worktree.target.executionHostId) {
      return null
    }
    const provenance = this.provenance.resolve({
      executionHostId: candidate.executionHostId,
      provider: candidate.provider,
      providerSessionId: candidate.providerSessionId
    })
    if (
      !provenance ||
      provenance.worktreeInstanceId !== worktree.instanceId ||
      provenance.spoolIncarnationId !== worktree.spoolIncarnationId
    ) {
      return null
    }
    return resolveHistoricalSession(worktree, candidate)
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        // Why: one catalog observer must not prevent later projections from invalidating.
        this.onListenerError(error)
      }
    }
  }
}

function toSessionWorktree(instance: SpoolPublicWorktreeInstance): SpoolSessionWorktreeIdentity {
  return {
    worktreeId: instance.worktreeId,
    instanceId: instance.instanceId,
    spoolIncarnationId: instance.spoolIncarnationId,
    target: instance.target
  }
}

function hasExactLiveBinding(
  worktree: SpoolSessionWorktreeIdentity,
  candidate: SpoolLiveSessionCandidate
): boolean {
  return (
    candidate.executionHostId === worktree.target.executionHostId &&
    candidate.worktreeInstanceId === worktree.instanceId &&
    candidate.spoolIncarnationId === worktree.spoolIncarnationId &&
    candidate.terminalHandle.length > 0 &&
    candidate.terminalHandle.length <= 2048
  )
}

function requireExactWorktreeIdentity(worktree: SpoolSessionWorktreeIdentity): void {
  if (
    worktree.target.worktreeId !== worktree.worktreeId ||
    worktree.target.instanceId !== worktree.instanceId ||
    worktree.target.executionHostId !== normalizeExecutionHostId(worktree.target.executionHostId) ||
    !worktree.spoolIncarnationId.trim()
  ) {
    throw new Error('Invalid Spool session worktree identity')
  }
}

function defaultListenerError(): void {
  console.error('[spool] Session catalog listener failed')
}
