import type {
  SpoolExecutionHostSessionReadRequest,
  SpoolExecutionHostSessionReader,
  SpoolHistoricalSessionCandidate,
  SpoolHistoricalSessionPurpose,
  SpoolLiveSessionCandidate,
  SpoolMobileSessionTabsResult,
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import type { SpoolOwnerSessionRecords } from './spool-owner-session-records'
import { SpoolObservedWorktreeProvenance } from './spool-observed-worktree-provenance'
import { SpoolSessionReadRoutes, spoolSessionReadRouteBinding } from './spool-session-read-routes'
import { SpoolSessionIdentityAliases } from './spool-session-identity-aliases'
import type { SpoolSessionProvenanceIndex } from './spool-session-provenance-index'
import type { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'
import { SpoolProviderSessionObserver } from './spool-provider-session-observer'
import {
  isReadyMobileSessionTerminalTab,
  projectMobileVaultHistoricalSession,
  projectMobileVaultLiveTab,
  type ReadyMobileSessionTerminalTab
} from './spool-mobile-vault-session-projection'
import { toSessionWorktree } from './spool-session-worktree-binding'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

const LIVE_SESSION_INVENTORY_SCOPE = '00000000-0000-4000-8000-000000000000'

export class SpoolMobileVaultSessionSource implements SpoolSessionSource {
  private readonly readRoutes: SpoolSessionReadRoutes
  private readonly observedWorktrees = new SpoolObservedWorktreeProvenance()
  private readonly publicWorktrees = new Map<string, SpoolSessionWorktreeIdentity>()
  private readonly identityAliases = new SpoolSessionIdentityAliases()
  private readonly providerSessionObserver: SpoolProviderSessionObserver
  private readonly liveSessionFingerprintByInstanceId = new Map<string, string>()

  constructor(
    private readonly reader: SpoolExecutionHostSessionReader,
    private readonly ownerRecords: SpoolOwnerSessionRecords,
    private readonly sessionBindings: SpoolTerminalSessionBindings,
    private readonly provenance: SpoolSessionProvenanceIndex,
    private readonly resolveLocalWslDistro?: (
      target: SpoolOwnerWorktree
    ) => string | null | Promise<string | null>
  ) {
    this.readRoutes = new SpoolSessionReadRoutes(
      async (request, cursor) => await this.reader.releaseAiVaultSessionPage(request, cursor)
    )
    this.providerSessionObserver = new SpoolProviderSessionObserver(
      this.sessionBindings,
      this.identityAliases,
      this.provenance
    )
  }

  trackPublicWorktree(instance: SpoolPublicWorktreeInstance): void {
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
    worktree: SpoolSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<readonly SpoolLiveSessionCandidate[]> {
    const request = toReadRequest(worktree, 'catalog', LIVE_SESSION_INVENTORY_SCOPE, null)
    const snapshot = await this.reader.listMobileSessionTabs(request, signal)
    signal?.throwIfAborted()
    if (!snapshot || snapshot.worktree !== worktree.worktreeId) {
      return []
    }
    this.rememberObservedWorktree(worktree)
    const sessions = this.projectLiveSessions(worktree, snapshot)
    this.updateLiveSessionFingerprint(worktree.instanceId, sessions)
    return sessions
  }

  private projectLiveSessions(
    worktree: SpoolSessionWorktreeIdentity,
    snapshot: SpoolMobileSessionTabsResult
  ): SpoolLiveSessionCandidate[] {
    this.providerSessionObserver.observeSnapshot(snapshot, worktree)
    const readyTabs = snapshot.tabs.filter(
      (tab): tab is ReadyMobileSessionTerminalTab =>
        isReadyMobileSessionTerminalTab(tab) && tab.worktreeInstanceId === worktree.instanceId
    )
    this.sessionBindings.reconcile(worktree, new Set(readyTabs.map((tab) => tab.terminal)))
    const sessions = readyTabs
      .map((tab) =>
        projectMobileVaultLiveTab(
          worktree,
          tab,
          this.sessionBindings.resolve(worktree, tab.terminal)
        )
      )
      .filter((session): session is SpoolLiveSessionCandidate => session !== null)
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
    return sessions
  }

  async listHistoricalSessionPage(
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string,
    signal?: AbortSignal
  ) {
    const binding = spoolSessionReadRouteBinding(worktree, purpose, inventoryScope)
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
      const candidates: SpoolHistoricalSessionCandidate[] = []
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
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string
  ): Promise<void> {
    const request = this.readRoutes.release(
      spoolSessionReadRouteBinding(worktree, purpose, inventoryScope),
      cursor
    )
    if (request) {
      await this.reader.releaseAiVaultSessionPage(request, cursor)
    }
  }

  resolveOwnerHistoricalRecord(ownerRecordKey: string): SpoolOwnerHistoricalSessionRecord | null {
    return this.ownerRecords.resolve(ownerRecordKey)
  }

  retainOwnerHistoricalRecord(record: SpoolOwnerHistoricalSessionRecord): boolean {
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
        if (snapshot) {
          // Why: paired runtimes can contain cloned worktree UUIDs; the originating
          // execution route must match before its provider id gains provenance.
          liveSessionsChanged = this.updateLiveSessionFingerprint(
            observed.instanceId,
            this.projectLiveSessions(observed, snapshot)
          )
        }
        const providerSessionsChanged = Boolean(providerSessions?.length)
        if (providerSessionsChanged && providerSessions) {
          this.providerSessionObserver.observeExplicit(providerSessions, observed)
        }
        // Why: runtime snapshots include frequent status-only updates; rebuilding
        // the same Public session rows must not abort their historical page scan.
        if (liveSessionsChanged || providerSessionsChanged) {
          listener()
        }
      }) ?? (() => {})
    const unsubscribeSessionBindings = this.sessionBindings.subscribe(listener)
    return () => {
      unsubscribeReader()
      unsubscribeSessionBindings()
    }
  }

  private rememberObservedWorktree(worktree: SpoolSessionWorktreeIdentity): void {
    this.observedWorktrees.remember(worktree)
  }

  private updateLiveSessionFingerprint(
    instanceId: string,
    sessions: readonly SpoolLiveSessionCandidate[]
  ): boolean {
    const fingerprint = JSON.stringify(sessions)
    const previous = this.liveSessionFingerprintByInstanceId.get(instanceId)
    this.liveSessionFingerprintByInstanceId.set(instanceId, fingerprint)
    return previous !== fingerprint
  }

  private unregisterPublicWorktreeRoute(worktree: SpoolSessionWorktreeIdentity): void {
    this.observedWorktrees.forget(worktree)
    this.reader.unregisterPublicWorktree?.(liveSessionReadRequest(worktree))
  }
}

function isSameSessionIdentityScope(
  left: Pick<SpoolSessionWorktreeIdentity, 'instanceId' | 'spoolIncarnationId' | 'actualHostScope'>,
  right: Pick<SpoolSessionWorktreeIdentity, 'instanceId' | 'spoolIncarnationId' | 'actualHostScope'>
): boolean {
  return (
    left.instanceId === right.instanceId &&
    left.spoolIncarnationId === right.spoolIncarnationId &&
    left.actualHostScope === right.actualHostScope
  )
}

function liveSessionReadRequest(
  worktree: SpoolSessionWorktreeIdentity
): SpoolExecutionHostSessionReadRequest {
  return toReadRequest(worktree, 'catalog', LIVE_SESSION_INVENTORY_SCOPE, null)
}

function toReadRequest(
  worktree: SpoolSessionWorktreeIdentity,
  purpose: SpoolHistoricalSessionPurpose,
  inventoryScope: string,
  localWslDistro: string | null
) {
  return {
    worktreeKind: worktree.target.kind,
    executionHostId: worktree.target.executionHostId,
    worktreeId: worktree.worktreeId,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    worktreePath: worktree.target.worktreePath,
    localWslDistro,
    purpose,
    inventoryScope
  }
}
