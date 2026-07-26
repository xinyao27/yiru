import {
  isReadyMobileSessionTerminalTab,
  projectMobileVaultHistoricalSession,
  projectMobileVaultLiveTab,
  type ReadyMobileSessionTerminalTab
} from './mobile-vault-session-projection'
import { CoworkingObservedWorktreeProvenance } from './observed-worktree-provenance'
import type { CoworkingOwnerSessionRecords } from './owner-session-records'
import { CoworkingProviderSessionObserver } from './provider-session-observer'
import { CoworkingSessionIdentityAliases } from './session-identity-aliases'
import type { CoworkingSessionProvenanceIndex } from './session-provenance-index'
import {
  isSameSessionIdentityScope,
  LIVE_SESSION_INVENTORY_SCOPE,
  liveSessionReadRequest,
  toReadRequest
} from './session-read-request'
import { CoworkingSessionReadRoutes, coworkingSessionReadRouteBinding } from './session-read-routes'
import type {
  CoworkingExecutionHostSessionReader,
  CoworkingHistoricalSessionCandidate,
  CoworkingHistoricalSessionPurpose,
  CoworkingLiveSessionCandidate,
  CoworkingMobileSessionTabsResult,
  CoworkingOwnerHistoricalSessionRecord,
  CoworkingSessionSource,
  CoworkingSessionWorktreeIdentity
} from './session-source'
import { toSessionWorktree } from './session-worktree-binding'
import type { CoworkingTerminalSessionBindings } from './terminal-session-bindings'
import type { CoworkingOwnerWorktree } from './worktree-incarnation'
import type { CoworkingPublicWorktreeInstance } from './worktree-visibility'

export class CoworkingMobileVaultSessionSource implements CoworkingSessionSource {
  private readonly readRoutes: CoworkingSessionReadRoutes
  private readonly observedWorktrees = new CoworkingObservedWorktreeProvenance()
  private readonly publicWorktrees = new Map<string, CoworkingSessionWorktreeIdentity>()
  private readonly identityAliases = new CoworkingSessionIdentityAliases()
  private readonly providerSessionObserver: CoworkingProviderSessionObserver
  private readonly liveSessionFingerprintByInstanceId = new Map<string, string>()

  constructor(
    private readonly reader: CoworkingExecutionHostSessionReader,
    private readonly ownerRecords: CoworkingOwnerSessionRecords,
    private readonly sessionBindings: CoworkingTerminalSessionBindings,
    private readonly provenance: CoworkingSessionProvenanceIndex,
    private readonly resolveLocalWslDistro?: (
      target: CoworkingOwnerWorktree
    ) => string | null | Promise<string | null>
  ) {
    this.readRoutes = new CoworkingSessionReadRoutes(
      async (request, cursor) => await this.reader.releaseAiVaultSessionPage(request, cursor)
    )
    this.providerSessionObserver = new CoworkingProviderSessionObserver(
      this.sessionBindings,
      this.identityAliases,
      this.provenance
    )
  }

  trackPublicWorktree(instance: CoworkingPublicWorktreeInstance): void {
    const worktree = toSessionWorktree(instance)
    const previous = this.publicWorktrees.get(instance.instanceId)
    if (previous) {
      this.unregisterPublicWorktreeRoute(previous)
      if (!isSameSessionIdentityScope(previous, worktree)) {
        // Why: only a route rename preserves identity; reusing an instance id in
        // another incarnation or host must not revive an older session alias.
        this.identityAliases.forget(instance.instanceId)
      }
    }
    this.publicWorktrees.set(instance.instanceId, worktree)
    const request = liveSessionReadRequest(worktree)
    this.rememberObservedWorktree(worktree)
    // Why: future owner sessions must gain provenance even before any requester opens the catalog.
    this.reader.registerPublicWorktree?.(request)
    void this.listLiveSessions(worktree).catch(() => {
      // Publication remains readable; the normal catalog path retries unavailable host inventory.
    })
  }

  untrackPublicWorktree(instanceId: string): void {
    const worktree = this.publicWorktrees.get(instanceId)
    this.publicWorktrees.delete(instanceId)
    if (worktree) {
      this.unregisterPublicWorktreeRoute(worktree)
    }
    // Why: invalidation is the lifecycle boundary that finally retires every
    // alias for this instance, including aliases retained across route replacements.
    this.identityAliases.forget(instanceId)
    this.liveSessionFingerprintByInstanceId.delete(instanceId)
  }

  async listLiveSessions(
    worktree: CoworkingSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<readonly CoworkingLiveSessionCandidate[]> {
    const request = toReadRequest(worktree, 'catalog', LIVE_SESSION_INVENTORY_SCOPE, null)
    const snapshot = await this.reader.listMobileSessionTabs(request, signal)
    signal?.throwIfAborted()
    if (!snapshot || snapshot.worktree !== worktree.worktreeId) {
      return []
    }
    this.rememberObservedWorktree(worktree)
    const { sessions } = this.projectLiveSessions(worktree, snapshot)
    this.updateLiveSessionFingerprint(worktree.instanceId, sessions)
    return sessions
  }

  private projectLiveSessions(
    worktree: CoworkingSessionWorktreeIdentity,
    snapshot: CoworkingMobileSessionTabsResult
  ): { sessions: CoworkingLiveSessionCandidate[]; providerObservationChanged: boolean } {
    const providerObservationChanged = this.providerSessionObserver.observeSnapshot(
      snapshot,
      worktree
    )
    const readyTabs = snapshot.tabs.filter(
      (tab): tab is ReadyMobileSessionTerminalTab =>
        isReadyMobileSessionTerminalTab(tab) && tab.worktreeInstanceId === worktree.instanceId
    )
    this.sessionBindings.reconcile(worktree, new Set(readyTabs.map((tab) => tab.terminal)))
    // Why: opening a worktree without a session selects the first catalog row,
    // so preserve the owner's current terminal as the initial remote surface.
    const ownerRankedTabs = [
      ...readyTabs.filter((tab) => tab.isActive),
      ...readyTabs.filter((tab) => !tab.isActive)
    ]
    const sessions = ownerRankedTabs
      .map((tab) =>
        projectMobileVaultLiveTab(
          worktree,
          tab,
          this.sessionBindings.resolve(worktree, tab.terminal)
        )
      )
      .filter((session): session is CoworkingLiveSessionCandidate => session !== null)
    for (const session of sessions) {
      if (
        (session.provider === 'claude' || session.provider === 'codex') &&
        session.providerSessionId &&
        session.sessionKey
      ) {
        this.identityAliases.remember(
          worktree,
          session.provider,
          session.providerSessionId,
          session.sessionKey
        )
      }
    }
    return { sessions, providerObservationChanged }
  }

  async listHistoricalSessionPage(
    worktree: CoworkingSessionWorktreeIdentity,
    purpose: CoworkingHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string,
    signal?: AbortSignal
  ) {
    const binding = coworkingSessionReadRouteBinding(worktree, purpose, inventoryScope)
    const firstRequest =
      cursor === null
        ? toReadRequest(
            worktree,
            purpose,
            inventoryScope,
            (await this.resolveLocalWslDistro?.(worktree.target)) ?? null
          )
        : undefined
    signal?.throwIfAborted()
    const lease = this.readRoutes.begin(binding, cursor, firstRequest)
    let abandonedCursor: string | null = null
    try {
      const result = await this.reader.listAiVaultSessionPage(lease.request, cursor, signal)
      abandonedCursor = result.nextCursor
      signal?.throwIfAborted()
      const candidates: CoworkingHistoricalSessionCandidate[] = []
      for (const session of result.sessions) {
        const candidate = projectMobileVaultHistoricalSession(worktree, session)
        if (candidate) {
          candidates.push({
            ...candidate,
            sessionKey: this.identityAliases.resolve(worktree, candidate)
          })
        }
      }
      this.readRoutes.commit(lease, result.nextCursor)
      abandonedCursor = null
      return {
        sessions: candidates,
        nextCursor: result.nextCursor,
        scannedAt: result.scannedAt
      }
    } catch (error) {
      const cursorToRelease = abandonedCursor ?? cursor
      this.readRoutes.fail(lease)
      try {
        // Why: null cancels an opening read; continuations still use their frozen route.
        await this.reader.releaseAiVaultSessionPage(lease.request, cursorToRelease)
      } catch {
        // Preserve the page failure; the reader also expires abandoned cursors.
      }
      throw error
    }
  }

  async releaseHistoricalSessionPage(
    worktree: CoworkingSessionWorktreeIdentity,
    purpose: CoworkingHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string
  ): Promise<void> {
    const request = this.readRoutes.release(
      coworkingSessionReadRouteBinding(worktree, purpose, inventoryScope),
      cursor
    )
    if (request) {
      await this.reader.releaseAiVaultSessionPage(request, cursor)
    }
  }

  resolveOwnerHistoricalRecord(
    ownerRecordKey: string
  ): CoworkingOwnerHistoricalSessionRecord | null {
    return this.ownerRecords.resolve(ownerRecordKey)
  }

  retainOwnerHistoricalRecord(record: CoworkingOwnerHistoricalSessionRecord): boolean {
    return this.ownerRecords.rememberResolved(record)
  }

  subscribe(listener: () => void): () => void {
    const unsubscribeReader =
      this.reader.subscribe?.((snapshot, request, providerSessions) => {
        const observedScope = request ? this.observedWorktrees.resolve(request) : undefined
        const observed = observedScope
          ? this.publicWorktrees.get(observedScope.instanceId)
          : undefined
        if (
          !observedScope ||
          !observed ||
          observed.worktreeId !== observedScope.worktreeId ||
          !isSameSessionIdentityScope(observed, observedScope)
        ) {
          // Why: the runtime reports every workspace's tab/status changes; only
          // Public worktrees may invalidate an in-flight Public session catalog.
          return
        }
        let liveSessionsChanged = false
        let providerObservationChanged = false
        if (snapshot) {
          // Why: paired runtimes can contain cloned worktree UUIDs; the originating
          // execution route must match before its provider id gains provenance.
          const projection = this.projectLiveSessions(observed, snapshot)
          liveSessionsChanged = this.updateLiveSessionFingerprint(
            observed.instanceId,
            projection.sessions
          )
          providerObservationChanged = projection.providerObservationChanged
        }
        if (providerSessions?.length) {
          providerObservationChanged =
            this.providerSessionObserver.observeExplicit(providerSessions, observed) ||
            providerObservationChanged
        }
        // Why: runtime snapshots include frequent status-only updates; rebuilding
        // the same Public session rows must not abort their historical page scan.
        if (liveSessionsChanged || providerObservationChanged) {
          listener()
        }
      }) ?? (() => {})
    const unsubscribeSessionBindings = this.sessionBindings.subscribe((instanceId) => {
      // Why: private terminal launches share this owner-wide binding index but
      // cannot change any requester-visible Public catalog.
      if (this.publicWorktrees.has(instanceId)) {
        listener()
      }
    })
    return () => {
      unsubscribeReader()
      unsubscribeSessionBindings()
    }
  }

  private rememberObservedWorktree(worktree: CoworkingSessionWorktreeIdentity): void {
    this.observedWorktrees.remember(worktree)
  }

  private updateLiveSessionFingerprint(
    instanceId: string,
    sessions: readonly CoworkingLiveSessionCandidate[]
  ): boolean {
    const fingerprint = JSON.stringify(sessions)
    const previous = this.liveSessionFingerprintByInstanceId.get(instanceId)
    this.liveSessionFingerprintByInstanceId.set(instanceId, fingerprint)
    return previous !== fingerprint
  }

  private unregisterPublicWorktreeRoute(worktree: CoworkingSessionWorktreeIdentity): void {
    this.observedWorktrees.forget(worktree)
    this.reader.unregisterPublicWorktree?.(liveSessionReadRequest(worktree))
  }
}
