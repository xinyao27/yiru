import type {
  SpoolControlGrant,
  SpoolControlRequest
} from '../../shared/spool/spool-access-contract'
import type {
  SpoolDecideControlArgs,
  SpoolOwnerControlGrantView,
  SpoolOwnerControlRequestView,
  SpoolOwnerWorktreeSharing,
  SpoolRequestControlArgs,
  SpoolRequesterInvokeArgs,
  SpoolRequesterSubscriptionArgs,
  SpoolRevokeControlArgs,
  SpoolSetProjectVisibilityArgs,
  SpoolSetWorktreeVisibilityArgs,
  SpoolSharingSnapshot
} from '../../shared/spool/spool-ipc-contract'
import type {
  SpoolWindowsFirewallRepairResult,
  SpoolWindowsFirewallStatus
} from '../../shared/spool/spool-windows-firewall-contract'
import type { SpoolSharingIpcController } from '../ipc/spool-sharing'
import type {
  SpoolDesktopCatalogSnapshot,
  SpoolRequesterSubscriptionSink
} from './spool-desktop-catalog'
import type { SpoolDesktopServiceOptions } from './spool-desktop-service-options'
import { SpoolDesktopStartRecovery } from './spool-desktop-start-recovery'
import { SpoolWindowsFirewallRecovery } from './spool-windows-firewall-recovery'

export class SpoolDesktopService implements SpoolSharingIpcController {
  private readonly listeners = new Set<(snapshot: SpoolSharingSnapshot) => void>()
  private readonly unsubscribes: (() => void)[] = []
  private remoteSnapshot: SpoolDesktopCatalogSnapshot = { desktops: [], controlStates: [] }
  private requests: readonly SpoolControlRequest[] = []
  private grants: readonly SpoolControlGrant[] = []
  private status: SpoolSharingSnapshot['status'] = 'starting'
  private diagnostic: string | null = null
  private stopped = false
  private startAttempt: Promise<void> | null = null
  private readonly startRecovery = new SpoolDesktopStartRecovery()
  private readonly windowsFirewallRecovery: SpoolWindowsFirewallRecovery

  constructor(private readonly options: SpoolDesktopServiceOptions) {
    this.windowsFirewallRecovery = new SpoolWindowsFirewallRecovery(
      options.windowsFirewall,
      () => this.diagnostic === 'spool_windows_firewall_unavailable',
      () => this.recoverWindowsFirewall()
    )
    this.unsubscribes.push(
      options.desktopCatalog.subscribe((snapshot) => {
        this.remoteSnapshot = snapshot
        this.emit()
      }),
      options.access.subscribeOwnerRequests((requests) => {
        this.requests = requests
        this.emit()
      }),
      options.access.subscribeGrants((grants) => {
        this.grants = grants
        this.emit()
      }),
      options.visibility.subscribe((change) => {
        if (change.kind === 'invalidated') {
          options.access.invalidateWorktree(change.instanceId)
        }
        this.emit()
      }),
      options.visibility.subscribeDegraded(() => this.enterUnavailable('persistence_unavailable'))
    )
  }

  start(): Promise<void> {
    if (this.stopped || this.status === 'ready') {
      return Promise.resolve()
    }
    if (this.startAttempt) {
      return this.startAttempt
    }
    // Why: a manual availability retry can race the scheduled retry; one
    // ingress attempt avoids competing binds tearing down a successful start.
    const attempt = this.startOnce()
    const tracked = attempt.finally(() => {
      if (this.startAttempt === tracked) {
        this.startAttempt = null
      }
    })
    this.startAttempt = tracked
    return tracked
  }

  private async startOnce(): Promise<void> {
    this.startRecovery.cancel()
    try {
      // Why: uncertain deny recovery must never enter the automatic network retry loop.
      await this.options.visibility.initialize()
    } catch {
      await this.enterUnavailable('persistence_unavailable')
      return
    }
    if (this.stopped) {
      return
    }
    try {
      await this.options.prepareIngress?.()
      if (this.stopped) {
        return
      }
      await this.options.ingress.start()
      if (this.stopped) {
        return
      }
      this.options.desktopCatalog.start()
      this.status = 'ready'
      this.diagnostic = null
      this.emit()
    } catch (error) {
      await this.enterUnavailable(projectDiagnostic(error))
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return
    }
    this.stopped = true
    this.startRecovery.cancel()
    await this.startAttempt?.catch(() => undefined)
    this.options.desktopCatalog.stop()
    await this.options.ingress.stop()
    this.options.shareCatalog.close()
    for (const unsubscribe of this.unsubscribes.splice(0)) {
      unsubscribe()
    }
  }

  snapshot(): SpoolSharingSnapshot {
    return {
      status: this.status,
      diagnostic: this.diagnostic,
      remoteDesktops: this.remoteSnapshot.desktops,
      ownerWorktrees: this.projectOwnerWorktrees(),
      ownerControlRequests: this.requests.flatMap((request) => {
        const projected = this.projectRequest(request)
        return projected ? [projected] : []
      }),
      ownerControlGrants: this.grants.flatMap((grant) => {
        const projected = this.projectGrant(grant)
        return projected ? [projected] : []
      }),
      requesterControlStates: this.remoteSnapshot.controlStates
    }
  }

  subscribe(listener: (snapshot: SpoolSharingSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  async setWorktreeVisibility(args: SpoolSetWorktreeVisibilityArgs): Promise<void> {
    await this.options.visibility.setWorktree(args.worktreeId, args.visibility)
    this.emit()
  }

  async setProjectVisibility(args: SpoolSetProjectVisibilityArgs): Promise<void> {
    await this.options.visibility.setProject(args.projectId, args.visibility)
    this.emit()
  }

  async requestControl(args: SpoolRequestControlArgs): Promise<void> {
    await this.options.desktopCatalog.requestControl(args.desktopRef, args.worktreeRef)
  }

  async decideControl(args: SpoolDecideControlArgs): Promise<void> {
    this.options.access.decide({ requestId: args.requestId, decision: args.decision })
  }

  async revokeControl(args: SpoolRevokeControlArgs): Promise<void> {
    this.options.access.revoke(args.grantId)
  }

  getWindowsFirewallStatus(): Promise<SpoolWindowsFirewallStatus> {
    return this.windowsFirewallRecovery.inspect()
  }

  repairWindowsFirewall(): Promise<SpoolWindowsFirewallRepairResult> {
    return this.windowsFirewallRecovery.repair()
  }

  retryAvailability(): Promise<void> {
    return this.recoverAvailability()
  }

  invokeRequester(args: SpoolRequesterInvokeArgs): Promise<unknown> {
    return this.options.desktopCatalog.invokeRequester(args)
  }

  subscribeRequester(
    args: SpoolRequesterSubscriptionArgs,
    sink: SpoolRequesterSubscriptionSink
  ): { close(): void } {
    return this.options.desktopCatalog.subscribeRequester(args, sink)
  }

  async reconcileRegisteredWorktrees(): Promise<void> {
    if (this.status !== 'ready') {
      return
    }
    await this.options.visibility.reconcile({ kind: 'registered-roots-changed' })
  }

  async reportIngressUnavailable(error: Error): Promise<void> {
    await this.enterUnavailable(projectDiagnostic(error))
  }

  private projectOwnerWorktrees(): readonly SpoolOwnerWorktreeSharing[] {
    return this.options.visibility.snapshot().worktrees.flatMap((entry) => {
      const descriptor = this.options.describeOwnerWorktree(entry.worktreeId)
      return descriptor
        ? [
            {
              worktreeId: entry.worktreeId,
              projectId: descriptor.projectId,
              displayName: descriptor.displayName,
              visibility: entry.visibility,
              publicationStatus: entry.publicationStatus,
              shareEpoch: entry.shareEpoch
            }
          ]
        : []
    })
  }

  private projectRequest(request: SpoolControlRequest): SpoolOwnerControlRequestView | null {
    const target = this.findOwnerTarget(request.instanceId)
    return target
      ? {
          requestId: request.requestId,
          requester: { ...request.requester },
          worktreeId: target.worktreeId,
          worktreeDisplayName: target.displayName,
          requestedAt: request.requestedAt
        }
      : null
  }

  private projectGrant(grant: SpoolControlGrant): SpoolOwnerControlGrantView | null {
    const target = this.findOwnerTarget(grant.instanceId)
    const principal = this.options.access.getConnectionPrincipal(grant.connectionId)
    return target && principal
      ? {
          grantId: grant.grantId,
          requester: { ...principal.tailnet },
          worktreeId: target.worktreeId,
          worktreeDisplayName: target.displayName,
          approvedAt: grant.approvedAt
        }
      : null
  }

  private findOwnerTarget(instanceId: string): { worktreeId: string; displayName: string } | null {
    const state = this.options.visibility
      .snapshot()
      .worktrees.find((worktree) => worktree.instanceId === instanceId)
    const descriptor = state ? this.options.describeOwnerWorktree(state.worktreeId) : null
    return state && descriptor
      ? { worktreeId: state.worktreeId, displayName: descriptor.displayName }
      : null
  }

  private async recoverWindowsFirewall(): Promise<void> {
    // Why: a repaired rule is useful only after the listener and periodic
    // publication reconciliation are restored in this same app session.
    await this.recoverAvailability()
  }

  private async recoverAvailability(): Promise<void> {
    await this.start()
    if (this.status === 'ready') {
      await this.options.onAvailabilityRecovered?.()
    }
  }

  private async enterUnavailable(diagnostic: string): Promise<void> {
    if (this.stopped) {
      return
    }
    this.status = 'unavailable'
    this.diagnostic = diagnostic
    this.options.desktopCatalog.stop()
    await this.options.ingress.stop().catch(() => {})
    this.emit()
    this.startRecovery.schedule(diagnostic, () => this.recoverAvailability())
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function projectDiagnostic(error: unknown): string {
  const code = errorCode(error)
  if (code === 'EADDRINUSE') {
    return 'spool_port_unavailable'
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return 'spool_permission_denied'
  }
  if (error instanceof Error && /^tailscale_[a-z-]+$/.test(error.message)) {
    return error.message
  }
  if (error instanceof Error && error.message === 'spool_windows_firewall_unavailable') {
    return error.message
  }
  return 'spool_unavailable'
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }
  return typeof error.code === 'string' ? error.code : null
}
