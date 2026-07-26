import { COWORKING_CATALOG_MAX_SESSIONS_PER_WORKTREE } from '../../shared/coworking/catalog-contract'
import { COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE } from '../../shared/coworking/resource-limits'
import { waitForSessionInventoryAbort } from '../ai-vault/session-inventory-abort'
import { CoworkingExecutionError } from './execution-error'
import { readCoworkingHistoricalSessionPages } from './historical-session-pages'
import {
  projectCoworkingSessionCatalogValue,
  coworkingSessionCatalogError,
  tagCoworkingSessionCatalogStage
} from './session-catalog-error'
import {
  matchesHistoricalSession,
  type CoworkingSessionInventoryCache
} from './session-inventory-cache'
import type {
  CoworkingSessionProvenance,
  CoworkingSessionProvenanceIndex
} from './session-provenance-index'
import {
  resolveHistoricalSession,
  resolveLiveSession,
  sessionDedupeKey,
  toSessionDescription,
  type CoworkingResolvedHistoricalSession,
  type CoworkingResolvedSession,
  type CoworkingSessionCatalogDescription
} from './session-resolution'
import type {
  CoworkingHistoricalSessionCandidate,
  CoworkingHistoricalSessionConsistency,
  CoworkingLiveSessionCandidate,
  CoworkingOwnerHistoricalSessionRecord,
  CoworkingPreparedHistoricalSessionConsistency,
  CoworkingSessionSource,
  CoworkingSessionWorktreeIdentity
} from './session-source'
import { hasExactLiveBinding } from './session-worktree-binding'

const MAX_SOURCE_PAGES_PER_CATALOG_PAGE = 8

type ResolvedPageEntry = {
  session: CoworkingResolvedSession
  record: CoworkingOwnerHistoricalSessionRecord | null
}

export type CoworkingSessionPageState = {
  worktree: CoworkingSessionWorktreeIdentity
  inventoryScope: string
  historicalPages: AsyncGenerator<readonly CoworkingHistoricalSessionCandidate[]>
  historicalComplete: boolean
  pending: ResolvedPageEntry[]
  pendingOffset: number
  dedupeKeys: Set<string>
  historicalConsistency: CoworkingPreparedHistoricalSessionConsistency
}

export type CoworkingProjectedSessionPage = {
  sessions: readonly CoworkingSessionCatalogDescription[]
  complete: boolean
}

export class CoworkingSessionPageProjector {
  constructor(
    private readonly provenance: CoworkingSessionProvenanceIndex,
    private readonly source: CoworkingSessionSource,
    private readonly historicalConsistency: CoworkingHistoricalSessionConsistency,
    private readonly inventories: CoworkingSessionInventoryCache,
    private readonly onProvenanceRebound: () => void
  ) {}

  async open(
    worktree: CoworkingSessionWorktreeIdentity,
    inventoryScope: string,
    requireCurrent: () => void,
    signal: AbortSignal
  ): Promise<CoworkingSessionPageState> {
    signal.throwIfAborted()
    const live = await tagCoworkingSessionCatalogStage(
      waitForSessionInventoryAbort(this.source.listLiveSessions(worktree, signal), signal),
      'session-live-read'
    )
    signal.throwIfAborted()
    requireCurrent()
    if (live.length > COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE) {
      // Why: every route shares this owner-side cap before a cursor chain retains live rows.
      throw new CoworkingExecutionError('result_too_large')
    }
    const liveSessions = live.filter((candidate) => hasExactLiveBinding(worktree, candidate))
    try {
      this.attestProviderSessions(worktree, liveSessions)
    } catch (error) {
      throw coworkingSessionCatalogError(error, 'session-provenance')
    }
    requireCurrent()
    const dedupeKeys = new Set<string>()
    const pending: ResolvedPageEntry[] = []
    for (const candidate of liveSessions) {
      const session = resolveLiveSession(worktree, candidate)
      const key = sessionDedupeKey(session)
      if (!dedupeKeys.has(key)) {
        dedupeKeys.add(key)
        pending.push({ session, record: null })
      }
    }
    const historicalConsistency = await tagCoworkingSessionCatalogStage(
      waitForSessionInventoryAbort(this.historicalConsistency.open(worktree, signal), signal),
      'session-consistency'
    )
    signal.throwIfAborted()
    requireCurrent()
    return {
      worktree,
      inventoryScope,
      historicalPages: readCoworkingHistoricalSessionPages(
        this.source,
        worktree,
        'catalog',
        inventoryScope,
        signal
      ),
      historicalComplete: false,
      pending,
      pendingOffset: 0,
      dedupeKeys,
      historicalConsistency
    }
  }

  async project(
    state: CoworkingSessionPageState,
    requireCurrent: () => void,
    signal: AbortSignal
  ): Promise<CoworkingProjectedSessionPage> {
    const entries: ResolvedPageEntry[] = []
    drainPending(state, entries)
    let sourcePages = 0
    let observedCandidates = 0
    while (
      entries.length < COWORKING_CATALOG_MAX_SESSIONS_PER_WORKTREE &&
      !state.historicalComplete &&
      sourcePages < MAX_SOURCE_PAGES_PER_CATALOG_PAGE &&
      observedCandidates < COWORKING_CATALOG_MAX_SESSIONS_PER_WORKTREE
    ) {
      signal.throwIfAborted()
      const next = await tagCoworkingSessionCatalogStage(
        state.historicalPages.next(),
        'session-history-read'
      )
      signal.throwIfAborted()
      sourcePages++
      if (next.done) {
        state.historicalComplete = true
        break
      }
      observedCandidates += next.value.length
      state.pending.push(
        ...(await tagCoworkingSessionCatalogStage(
          this.resolveHistoricalPage(state, next.value, signal),
          'session-projection'
        ))
      )
      drainPending(state, entries)
    }
    // Why: an invalidated read must not repopulate a cache that source invalidation just cleared.
    requireCurrent()

    const records = new Map<string, CoworkingOwnerHistoricalSessionRecord>()
    for (const entry of entries) {
      if (entry.record) {
        records.set(entry.record.ownerRecordKey, entry.record)
      }
    }
    projectCoworkingSessionCatalogValue(() => {
      this.inventories.mergePage(
        state.worktree,
        entries.map((entry) => entry.session),
        records
      )
    }, 'session-cache')
    return {
      sessions: entries.map((entry) => toSessionDescription(entry.session)),
      complete: state.historicalComplete && state.pendingOffset >= state.pending.length
    }
  }

  private async resolveHistoricalPage(
    state: CoworkingSessionPageState,
    candidates: readonly CoworkingHistoricalSessionCandidate[],
    signal: AbortSignal
  ): Promise<ResolvedPageEntry[]> {
    const proven: {
      candidate: CoworkingHistoricalSessionCandidate
      session: CoworkingResolvedHistoricalSession
    }[] = []
    for (const candidate of candidates) {
      const session = this.resolveHistoricalSession(state.worktree, candidate)
      if (!session) {
        continue
      }
      if (!candidate.ownerRecord || !matchesHistoricalSession(candidate.ownerRecord, session)) {
        throw new Error('Coworking historical session record is invalid')
      }
      proven.push({ candidate, session })
    }
    const consistent = new Set(
      await state.historicalConsistency.retainConsistent(
        proven.map((entry) => entry.candidate),
        signal
      )
    )
    signal.throwIfAborted()
    const resolved: ResolvedPageEntry[] = []
    for (const entry of proven) {
      const key = sessionDedupeKey(entry.session)
      if (!consistent.has(entry.candidate) || state.dedupeKeys.has(key)) {
        continue
      }
      state.dedupeKeys.add(key)
      resolved.push({ session: entry.session, record: entry.candidate.ownerRecord })
    }
    return resolved
  }

  private resolveHistoricalSession(
    worktree: CoworkingSessionWorktreeIdentity,
    candidate: CoworkingHistoricalSessionCandidate
  ): CoworkingResolvedHistoricalSession | null {
    if (
      candidate.executionHostId !== worktree.target.executionHostId ||
      candidate.actualHostScope !== worktree.actualHostScope
    ) {
      return null
    }
    const provenance = this.provenance.resolve({
      actualHostScope: candidate.actualHostScope,
      provider: candidate.provider,
      providerSessionId: candidate.providerSessionId
    })
    if (
      !provenance ||
      provenance.worktreeInstanceId !== worktree.instanceId ||
      provenance.coworkingIncarnationId !== worktree.coworkingIncarnationId
    ) {
      return null
    }
    return resolveHistoricalSession(worktree, candidate)
  }

  private attestProviderSessions(
    worktree: CoworkingSessionWorktreeIdentity,
    sessions: readonly CoworkingLiveSessionCandidate[]
  ): void {
    const entries: CoworkingSessionProvenance[] = []
    for (const session of sessions) {
      if (
        (session.provider === 'claude' || session.provider === 'codex') &&
        session.providerSessionId
      ) {
        entries.push({
          actualHostScope: worktree.actualHostScope,
          provider: session.provider,
          providerSessionId: session.providerSessionId,
          worktreeInstanceId: worktree.instanceId,
          coworkingIncarnationId: worktree.coworkingIncarnationId
        })
      }
    }
    const rebound = entries.some((entry) => {
      const existing = this.provenance.resolve(entry)
      return (
        existing !== null &&
        (existing.worktreeInstanceId !== entry.worktreeInstanceId ||
          existing.coworkingIncarnationId !== entry.coworkingIncarnationId)
      )
    })
    const changed = this.provenance.attest(entries)
    if (changed && rebound) {
      // Why: a single provider session cannot remain addressable through its previous worktree.
      this.onProvenanceRebound()
    }
  }
}

function drainPending(state: CoworkingSessionPageState, page: ResolvedPageEntry[]): void {
  while (
    page.length < COWORKING_CATALOG_MAX_SESSIONS_PER_WORKTREE &&
    state.pendingOffset < state.pending.length
  ) {
    const entry = state.pending[state.pendingOffset++]
    if (entry) {
      page.push(entry)
    }
  }
  if (state.pendingOffset >= state.pending.length) {
    state.pending = []
    state.pendingOffset = 0
  }
}
