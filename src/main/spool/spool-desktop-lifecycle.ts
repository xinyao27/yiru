import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { SpoolDesktopService } from './spool-desktop-service'
import type { DefaultSpoolOwnerWorktreeCatalog } from './spool-owner-worktree-catalog'
import type { SpoolSessionCatalog } from './spool-session-catalog'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

const PUBLICATION_RECONCILE_INTERVAL_MS = 5_000

/** Owns Spool startup, runtime reconciliation, and teardown as one lifecycle unit. */
export class SpoolDesktopComposition {
  readonly service: SpoolDesktopService
  private readonly initialKnownInstances: Map<string, ExecutionHostId | null>
  private knownInstances = new Map<string, ExecutionHostId | null>()
  private reconcileTail: Promise<void> = Promise.resolve()
  private unsubscribeRuntime: (() => void) | null = null
  private reconcileTimer: ReturnType<typeof setInterval> | null = null
  private readyLifecycleArmed = false
  private stopped = false

  constructor(
    service: SpoolDesktopService,
    store: Store,
    private readonly catalog: DefaultSpoolOwnerWorktreeCatalog,
    private readonly visibility: SpoolWorktreeVisibility,
    private readonly sessions: SpoolSessionCatalog,
    private readonly lifecycleUnsubscribes: readonly (() => void)[],
    private readonly runtime: OrcaRuntimeService
  ) {
    this.service = service
    const repos = new Map(store.getRepos().map((repo) => [repo.id, repo] as const))
    this.initialKnownInstances = new Map(
      Object.entries(store.getAllWorktreeMeta()).flatMap(([worktreeId, meta]) => {
        if (!meta.instanceId || meta.spoolVisibility !== 'public') {
          return []
        }
        const repo = repos.get(getRepoIdFromWorktreeId(worktreeId))
        const repoHost = repo ? getRepoExecutionHostId(repo) : null
        // Why: runtime-backed rows route through the outer paired runtime, so outage
        // reconciliation must use that host instead of a stale inner-host metadata value.
        const executionHostId =
          parseExecutionHostId(repoHost)?.kind === 'runtime' ? repoHost : (meta.hostId ?? repoHost)
        return [[meta.instanceId, executionHostId] as const]
      })
    )
  }

  async start(): Promise<void> {
    if (this.stopped) {
      return
    }
    this.unsubscribeRuntime = this.runtime.onClientEvent((event) => {
      if (
        event.type === 'reposChanged' ||
        event.type === 'worktreesChanged' ||
        event.type === 'sshStateChanged'
      ) {
        this.scheduleReconcile()
      }
    })
    await this.service.start()
    await this.armReadyLifecycle()
  }

  recoverAfterAvailability(): Promise<void> {
    return this.armReadyLifecycle()
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return
    }
    this.stopped = true
    this.unsubscribeRuntime?.()
    this.unsubscribeRuntime = null
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
    await this.reconcileTail.catch(() => {})
    for (const unsubscribe of this.lifecycleUnsubscribes) {
      unsubscribe()
    }
    await this.service.stop()
    this.sessions.close()
  }

  private scheduleReconcile(): void {
    if (this.stopped || this.service.snapshot().status !== 'ready') {
      return
    }
    const previous = new Map(this.knownInstances)
    const operation = () => this.reconcileRegisteredWorktrees(previous)
    this.reconcileTail = this.reconcileTail.then(operation, operation)
  }

  private async armReadyLifecycle(): Promise<void> {
    if (this.stopped || this.readyLifecycleArmed || this.service.snapshot().status !== 'ready') {
      return
    }
    await this.reconcileRegisteredWorktrees(this.initialKnownInstances)
    if (this.stopped) {
      return
    }
    this.readyLifecycleArmed = true
    // Why: direct filesystem replacement may not emit a runtime event, but it
    // must still invalidate active streams and connection-scoped grants.
    this.reconcileTimer = setInterval(
      () => this.scheduleReconcile(),
      PUBLICATION_RECONCILE_INTERVAL_MS
    )
    this.reconcileTimer.unref()
  }

  private async reconcileRegisteredWorktrees(
    previous: ReadonlyMap<string, ExecutionHostId | null>
  ): Promise<void> {
    let inventory
    try {
      inventory = await this.catalog.inspectRegisteredWorktrees()
    } catch {
      await this.service.reconcileRegisteredWorktrees().catch(() => {})
      return
    }
    const current = new Map<string, ExecutionHostId | null>(
      inventory.worktrees.map((target) => [target.instanceId, target.executionHostId] as const)
    )
    const unavailableHosts = new Set(inventory.unavailableExecutionHostIds)
    for (const [instanceId, executionHostId] of previous) {
      if (!current.has(instanceId) && executionHostId && unavailableHosts.has(executionHostId)) {
        await this.visibility.reconcile({ kind: 'host-unavailable', instanceId })
        current.set(instanceId, executionHostId)
      } else if (!current.has(instanceId)) {
        await this.visibility.reconcile({ kind: 'deleted', instanceId })
      }
    }
    this.knownInstances = current
    await this.service.reconcileRegisteredWorktrees()
  }
}
