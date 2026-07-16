import { SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE } from '../../shared/spool/spool-catalog-contract'
import { SPOOL_MAX_LIVE_SESSIONS_PER_WORKTREE } from '../../shared/spool/spool-resource-limits'
import { waitForSessionInventoryAbort } from '../ai-vault/session-inventory-abort'
import { SpoolExecutionError } from './spool-execution-error'
import {
  projectSpoolSessionCatalogValue,
  spoolSessionCatalogError,
  tagSpoolSessionCatalogStage
} from './spool-session-catalog-error'
import { readSpoolHistoricalSessionPages } from './spool-historical-session-pages'
import {
  matchesHistoricalSession,
  type SpoolSessionInventoryCache
} from './spool-session-inventory-cache'
import {
  resolveHistoricalSession,
  resolveLiveSession,
  sessionDedupeKey,
  toSessionDescription,
  type SpoolResolvedHistoricalSession,
  type SpoolResolvedSession,
  type SpoolSessionCatalogDescription
} from './spool-session-resolution'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolHistoricalSessionConsistency,
  SpoolLiveSessionCandidate,
  SpoolOwnerHistoricalSessionRecord,
  SpoolPreparedHistoricalSessionConsistency,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type {
  SpoolSessionProvenance,
  SpoolSessionProvenanceIndex
} from './spool-session-provenance-index'
import { hasExactLiveBinding } from './spool-session-worktree-binding'

const MAX_SOURCE_PAGES_PER_CATALOG_PAGE = 8

type ResolvedPageEntry = {
  session: SpoolResolvedSession
  record: SpoolOwnerHistoricalSessionRecord | null
}

export type SpoolSessionPageState = {
  worktree: SpoolSessionWorktreeIdentity
  inventoryScope: string
  historicalPages: AsyncGenerator<readonly SpoolHistoricalSessionCandidate[]>
  historicalComplete: boolean
  pending: ResolvedPageEntry[]
  pendingOffset: number
  dedupeKeys: Set<string>
  historicalConsistency: SpoolPreparedHistoricalSessionConsistency
}

export type SpoolProjectedSessionPage = {
  sessions: readonly SpoolSessionCatalogDescription[]
  complete: boolean
}

export class SpoolSessionPageProjector {
  constructor(
    private readonly provenance: SpoolSessionProvenanceIndex,
    private readonly source: SpoolSessionSource,
    private readonly historicalConsistency: SpoolHistoricalSessionConsistency,
    private readonly inventories: SpoolSessionInventoryCache,
    private readonly onProvenanceRebound: () => void
  ) {}

  async open(
    worktree: SpoolSessionWorktreeIdentity,
    inventoryScope: string,
    requireCurrent: () => void,
    signal: AbortSignal
  ): Promise<SpoolSessionPageState> {
    signal.throwIfAborted()
    const live = await tagSpoolSessionCatalogStage(
      waitForSessionInventoryAbort(this.source.listLiveSessions(worktree, signal), signal),
      'session-live-read'
    )
    signal.throwIfAborted()
    requireCurrent()
    if (live.length > SPOOL_MAX_LIVE_SESSIONS_PER_WORKTREE) {
      // Why: every route shares this owner-side cap before a cursor chain retains live rows.
      throw new SpoolExecutionError('result_too_large')
    }
    const liveSessions = live.filter((candidate) => hasExactLiveBinding(worktree, candidate))
    try {
      this.attestProviderSessions(worktree, liveSessions)
    } catch (error) {
      throw spoolSessionCatalogError(error, 'session-provenance')
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
    const historicalConsistency = await tagSpoolSessionCatalogStage(
      waitForSessionInventoryAbort(this.historicalConsistency.open(worktree, signal), signal),
      'session-consistency'
    )
    signal.throwIfAborted()
    requireCurrent()
    return {
      worktree,
      inventoryScope,
      historicalPages: readSpoolHistoricalSessionPages(
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
    state: SpoolSessionPageState,
    requireCurrent: () => void,
    signal: AbortSignal
  ): Promise<SpoolProjectedSessionPage> {
    const entries: ResolvedPageEntry[] = []
    drainPending(state, entries)
    let sourcePages = 0
    let observedCandidates = 0
    while (
      entries.length < SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE &&
      !state.historicalComplete &&
      sourcePages < MAX_SOURCE_PAGES_PER_CATALOG_PAGE &&
      observedCandidates < SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE
    ) {
      signal.throwIfAborted()
      const next = await tagSpoolSessionCatalogStage(
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
        ...(await tagSpoolSessionCatalogStage(
          this.resolveHistoricalPage(state, next.value, signal),
          'session-projection'
        ))
      )
      drainPending(state, entries)
    }
    // Why: an invalidated read must not repopulate a cache that source invalidation just cleared.
    requireCurrent()

    const records = new Map<string, SpoolOwnerHistoricalSessionRecord>()
    for (const entry of entries) {
      if (entry.record) {
        records.set(entry.record.ownerRecordKey, entry.record)
      }
    }
    projectSpoolSessionCatalogValue(() => {
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
    state: SpoolSessionPageState,
    candidates: readonly SpoolHistoricalSessionCandidate[],
    signal: AbortSignal
  ): Promise<ResolvedPageEntry[]> {
    const proven: {
      candidate: SpoolHistoricalSessionCandidate
      session: SpoolResolvedHistoricalSession
    }[] = []
    for (const candidate of candidates) {
      const session = this.resolveHistoricalSession(state.worktree, candidate)
      if (!session) {
        continue
      }
      if (!candidate.ownerRecord || !matchesHistoricalSession(candidate.ownerRecord, session)) {
        throw new Error('Spool historical session record is invalid')
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
    worktree: SpoolSessionWorktreeIdentity,
    candidate: SpoolHistoricalSessionCandidate
  ): SpoolResolvedHistoricalSession | null {
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
      provenance.spoolIncarnationId !== worktree.spoolIncarnationId
    ) {
      return null
    }
    return resolveHistoricalSession(worktree, candidate)
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
          actualHostScope: worktree.actualHostScope,
          provider: session.provider,
          providerSessionId: session.providerSessionId,
          worktreeInstanceId: worktree.instanceId,
          spoolIncarnationId: worktree.spoolIncarnationId
        })
      }
    }
    const rebound = entries.some((entry) => {
      const existing = this.provenance.resolve(entry)
      return (
        existing !== null &&
        (existing.worktreeInstanceId !== entry.worktreeInstanceId ||
          existing.spoolIncarnationId !== entry.spoolIncarnationId)
      )
    })
    const changed = this.provenance.attest(entries)
    if (changed && rebound) {
      // Why: a single provider session cannot remain addressable through its previous worktree.
      this.onProvenanceRebound()
    }
  }
}

function drainPending(state: SpoolSessionPageState, page: ResolvedPageEntry[]): void {
  while (
    page.length < SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE &&
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
