import type {
  CoworkingControlGrant,
  CoworkingControlRequest
} from '~shared/coworking/access-contract'
import type { CoworkingHostAccessRequest } from '~shared/coworking/host-access-contract'
import type {
  CoworkingDecideHostAccessArgs,
  CoworkingDecideControlArgs,
  CoworkingListHostDevicesResult,
  CoworkingRequestHostAccessArgs,
  CoworkingRequestHostAccessResult,
  CoworkingRequestControlArgs,
  CoworkingRequesterInvokeArgs,
  CoworkingRequesterSubscriptionArgs,
  CoworkingRevokeControlArgs,
  CoworkingRevokeHostDeviceArgs,
  CoworkingRevokeHostDeviceResult,
  CoworkingSetProjectVisibilityArgs,
  CoworkingSetWorktreeVisibilityArgs,
  CoworkingSelfIdentity,
  CoworkingSharingSnapshot
} from '~shared/coworking/ipc-contract'
import type {
  CoworkingWindowsFirewallRepairResult,
  CoworkingWindowsFirewallStatus
} from '~shared/coworking/windows-firewall-contract'
import type { AuthenticatedCoworkingPrincipal } from '~shared/coworking/wire-contract'

import type { CoworkingSharingIpcController } from '../sharing'
import { CoworkingWindowsFirewallRecovery } from '../windows-firewall-recovery'
import { projectCoworkingAvailabilityDiagnostic } from './availability-diagnostic'
import type { CoworkingOwnerCatalogSnapshot, CoworkingRequesterSubscriptionSink } from './catalog'
import type { CoworkingOwnerServiceOptions } from './service-options'
import {
  projectActiveConnections,
  projectOwnerGrant,
  projectOwnerRequest,
  projectOwnerWorktrees,
  type CoworkingOwnerProjectionContext
} from './snapshot-projection'
import { CoworkingOwnerStartRecovery } from './start-recovery'

export class CoworkingOwnerService implements CoworkingSharingIpcController {
  private readonly listeners = new Set<(snapshot: CoworkingSharingSnapshot) => void>()
  private readonly unsubscribes: (() => void)[] = []
  private remoteSnapshot: CoworkingOwnerCatalogSnapshot = { desktops: [], controlStates: [] }
  private requests: readonly CoworkingControlRequest[] = []
  private hostAccessRequests: readonly CoworkingHostAccessRequest[] = []
  private grants: readonly CoworkingControlGrant[] = []
  private activeConnections: readonly AuthenticatedCoworkingPrincipal[] = []
  private self: CoworkingSelfIdentity | null = null
  private status: CoworkingSharingSnapshot['status'] = 'starting'
  private diagnostic: string | null = null
  private stopped = false
  private startAttempt: Promise<void> | null = null
  private readonly startRecovery = new CoworkingOwnerStartRecovery()
  private readonly windowsFirewallRecovery: CoworkingWindowsFirewallRecovery
  private readonly projectionContext: CoworkingOwnerProjectionContext

  constructor(private readonly options: CoworkingOwnerServiceOptions) {
    this.projectionContext = {
      visibility: options.visibility,
      describeOwnerWorktree: options.describeOwnerWorktree,
      getConnectionPrincipal: (connectionId) => options.access.getConnectionPrincipal(connectionId)
    }
    this.windowsFirewallRecovery = new CoworkingWindowsFirewallRecovery(
      options.windowsFirewall,
      () => this.diagnostic === 'coworking_windows_firewall_unavailable',
      () => this.recoverWindowsFirewall()
    )
    this.unsubscribes.push(
      options.ownerCatalog.subscribe((snapshot) => {
        this.remoteSnapshot = snapshot
        this.emit()
      }),
      options.access.subscribeOwnerRequests((requests) => {
        this.requests = requests
        this.emit()
      }),
      options.hostAccess.subscribe((requests) => {
        this.hostAccessRequests = requests
        this.emit()
      }),
      options.access.subscribeGrants((grants) => {
        this.grants = grants
        this.emit()
      }),
      options.access.subscribeConnections((connections) => {
        this.activeConnections = connections
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
      this.options.ownerCatalog.start()
      this.status = 'ready'
      this.diagnostic = null
      this.emit()
    } catch (error) {
      await this.enterUnavailable(projectCoworkingAvailabilityDiagnostic(error))
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return
    }
    this.stopped = true
    this.startRecovery.cancel()
    await this.startAttempt?.catch(() => undefined)
    this.options.ownerCatalog.stop()
    await this.options.ingress.stop()
    this.options.shareCatalog.close()
    for (const unsubscribe of this.unsubscribes.splice(0)) {
      unsubscribe()
    }
  }

  snapshot(): CoworkingSharingSnapshot {
    return {
      status: this.status,
      diagnostic: this.diagnostic,
      self: this.self,
      remoteDesktops: this.remoteSnapshot.desktops,
      ownerWorktrees: projectOwnerWorktrees(this.projectionContext),
      ownerControlRequests: this.requests.flatMap((request) => {
        const projected = projectOwnerRequest(this.projectionContext, request)
        return projected ? [projected] : []
      }),
      ownerHostAccessRequests: this.hostAccessRequests.map(
        ({ connectionId: _connectionId, ...request }) => request
      ),
      ownerControlGrants: this.grants.flatMap((grant) => {
        const projected = projectOwnerGrant(this.projectionContext, grant)
        return projected ? [projected] : []
      }),
      ownerActiveConnections: projectActiveConnections(this.activeConnections, this.grants),
      requesterControlStates: this.remoteSnapshot.controlStates
    }
  }

  subscribe(listener: (snapshot: CoworkingSharingSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  async setWorktreeVisibility(args: CoworkingSetWorktreeVisibilityArgs): Promise<void> {
    await this.options.visibility.setWorktree(args.worktreeId, args.visibility)
    this.emit()
  }

  async setProjectVisibility(args: CoworkingSetProjectVisibilityArgs): Promise<void> {
    await this.options.visibility.setProject(args.projectId, args.visibility)
    this.emit()
  }

  async requestControl(args: CoworkingRequestControlArgs): Promise<void> {
    await this.options.ownerCatalog.requestControl(args.desktopRef, args.worktreeRef)
  }

  async decideControl(args: CoworkingDecideControlArgs): Promise<void> {
    this.options.access.decide({ requestId: args.requestId, decision: args.decision })
  }

  requestHostAccess(
    args: CoworkingRequestHostAccessArgs
  ): Promise<CoworkingRequestHostAccessResult> {
    return this.options.ownerCatalog.requestHostAccess(args.desktopRef)
  }

  async decideHostAccess(args: CoworkingDecideHostAccessArgs): Promise<void> {
    this.options.hostAccess.decide(args)
  }

  async listHostDevices(): Promise<CoworkingListHostDevicesResult> {
    return { devices: this.options.hostDevices.listCoworkingHostDevices() }
  }

  async revokeHostDevice(
    args: CoworkingRevokeHostDeviceArgs
  ): Promise<CoworkingRevokeHostDeviceResult> {
    return { revoked: this.options.hostDevices.revokeCoworkingHostDevice(args.deviceId) }
  }

  async revokeControl(args: CoworkingRevokeControlArgs): Promise<void> {
    this.options.access.revoke(args.grantId)
  }

  getWindowsFirewallStatus(): Promise<CoworkingWindowsFirewallStatus> {
    return this.windowsFirewallRecovery.inspect()
  }

  repairWindowsFirewall(): Promise<CoworkingWindowsFirewallRepairResult> {
    return this.windowsFirewallRecovery.repair()
  }

  retryAvailability(): Promise<void> {
    return this.recoverAvailability()
  }

  invokeRequester(args: CoworkingRequesterInvokeArgs): Promise<unknown> {
    return this.options.ownerCatalog.invokeRequester(args)
  }

  subscribeRequester(
    args: CoworkingRequesterSubscriptionArgs,
    sink: CoworkingRequesterSubscriptionSink
  ): { close(): void } {
    return this.options.ownerCatalog.subscribeRequester(args, sink)
  }

  async reconcileRegisteredWorktrees(): Promise<void> {
    if (this.status !== 'ready') {
      return
    }
    await this.options.visibility.reconcile({ kind: 'registered-roots-changed' })
    // Why: host suspension/recovery preserves the share epoch and therefore
    // does not emit an authority invalidation, but owner UI still needs the new status.
    this.emit()
  }

  reportSelfIdentity(self: CoworkingSelfIdentity): void {
    if (
      this.self?.nodeDisplayName === self.nodeDisplayName &&
      this.self?.userDisplayName === self.userDisplayName
    ) {
      return
    }
    this.self = self
    this.emit()
  }

  async reportIngressUnavailable(error: Error): Promise<void> {
    await this.enterUnavailable(projectCoworkingAvailabilityDiagnostic(error))
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
    this.options.ownerCatalog.stop()
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
