import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { Store } from '~main/persistence'
import type { RateLimitService } from '~main/rate-limits/service'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import { COWORKING_INGRESS_PORT, type CoworkingOsFamily } from '~shared/coworking/wire-contract'

import { CoworkingAccessAuthority } from '../access-authority'
import { CoworkingExecutionGateway } from '../execution-gateway'
import { CoworkingCanonicalHistoricalSessionConsistency } from '../historical-session-consistency'
import { CoworkingIngress } from '../ingress'
import { CoworkingLegacySessionAttestor } from '../legacy-session-attestor'
import { resolveCoworkingLocalWslDistro } from '../local-wsl-route'
import { CoworkingMobileVaultSessionSource } from '../mobile-vault-session-source'
import { YiruCoworkingPairedRuntimeHostAdapter } from '../paired-runtime/host-adapter'
import { YiruCoworkingPairedRuntimeSessionReader } from '../paired-runtime/session-reader'
import { listCoworkingPairedRuntimeWorktrees } from '../paired-runtime/worktree-catalog'
import { createCoworkingPeerConnectivity } from '../peer/connectivity'
import { subscribePublicSessionRoutes } from '../public-session-route-subscription'
import { CoworkingQuotaProjection } from '../quota-projection'
import { CoworkingRpcGateway } from '../rpc/gateway'
import { authorizeCoworkingRpcInvocation, createDefaultCoworkingRpcRegistry } from '../rpc/registry'
import { CoworkingSessionCatalog } from '../session/catalog'
import { CoworkingSessionProvenanceIndex } from '../session/provenance-index'
import { CoworkingActualHostSessionRootMatcher } from '../session/root-matcher'
import { CoworkingShareCatalog } from '../share-catalog'
import { CoworkingTerminalAttachmentRegistry } from '../terminal-attachment-registry'
import { CoworkingVisibilityDenyJournal } from '../visibility-deny-journal'
import {
  assertWindowsCoworkingFirewallReady,
  inspectWindowsCoworkingFirewall,
  repairWindowsCoworkingFirewall
} from '../windows-firewall'
import { CoworkingWorktreeIncarnation, type CoworkingOwnerWorktree } from '../worktree-incarnation'
import { CoworkingActualHostWorktreeIncarnationHost } from '../worktree-incarnation-host'
import { CoworkingWorktreeVisibility } from '../worktree-visibility'
import { createYiruCoworkingHostAdapter } from '../yiru-host/adapter'
import { CoworkingOwnerComposition } from './lifecycle'
import { CoworkingOwnerService } from './service'
import { CoworkingOwnerShareSource } from './share-source'
import { DefaultCoworkingOwnerWorktreeCatalog } from './worktree-catalog'
import { resolveCoworkingOwnerWorktreeDescriptor } from './worktree-descriptor'

export { CoworkingOwnerComposition } from './lifecycle'

export type CoworkingOwnerCompositionOptions = {
  store: Store
  runtime: YiruRuntimeService
  rateLimits: Pick<RateLimitService, 'getState' | 'onStateChange'>
  userDataPath: string
  profileId: string
  ownerRuntimeId: string
  yiruVersion: string
  osFamily: CoworkingOsFamily
  isPackaged: boolean
  executablePath: string
}

export function createCoworkingOwnerComposition(
  options: CoworkingOwnerCompositionOptions
): CoworkingOwnerComposition {
  const catalog = new DefaultCoworkingOwnerWorktreeCatalog({
    store: options.store,
    runtime: options.runtime,
    listRuntimeWorktrees: (environmentId, repo) =>
      listCoworkingPairedRuntimeWorktrees(options.userDataPath, environmentId, repo)
  })
  let host: ReturnType<typeof createYiruCoworkingHostAdapter> | undefined
  const pairedRuntimeAdapter = new YiruCoworkingPairedRuntimeHostAdapter({
    userDataPath: options.userDataPath,
    resolveOwnerHistoricalRecord: (ownerRecordKey) =>
      host?.sessionRecords.resolve(ownerRecordKey) ?? null
  })
  const pairedRuntimeSessionReader = new YiruCoworkingPairedRuntimeSessionReader({
    userDataPath: options.userDataPath
  })
  const resolveLocalWslDistro = (target: CoworkingOwnerWorktree): string | null =>
    resolveCoworkingLocalWslDistro(options.store, target)
  const incarnationHost = new CoworkingActualHostWorktreeIncarnationHost({
    pairedRuntimeAdapter,
    resolveLocalWslDistro
  })
  const incarnation = new CoworkingWorktreeIncarnation(incarnationHost)
  const roots = new CoworkingActualHostSessionRootMatcher(incarnationHost)
  host = createYiruCoworkingHostAdapter({
    store: options.store,
    runtime: options.runtime,
    pairedRuntimeAdapter,
    pairedRuntimeSessionReader
  })
  const provenance = new CoworkingSessionProvenanceIndex(options.userDataPath)
  const sessionSource = new CoworkingMobileVaultSessionSource(
    host.sessionReader,
    host.sessionRecords,
    host.terminalSessionBindings,
    provenance,
    resolveLocalWslDistro
  )
  const sessions = new CoworkingSessionCatalog(
    provenance,
    sessionSource,
    new CoworkingCanonicalHistoricalSessionConsistency(catalog, incarnation, roots)
  )
  const attestor = new CoworkingLegacySessionAttestor(provenance, sessionSource, roots)
  const visibility = new CoworkingWorktreeVisibility({
    store: options.store,
    denyJournal: new CoworkingVisibilityDenyJournal(
      join(options.userDataPath, 'coworking-visibility-deny.json'),
      options.profileId
    ),
    catalog,
    incarnation,
    prepareFirstPublication: async (entries, registeredRoots, refreshInstanceIds) => {
      return await attestor.prepareFirstPublications(
        entries.map((entry) => ({
          target: entry.target,
          coworkingIncarnationId: entry.markerId,
          root: entry.root,
          forceRefresh: refreshInstanceIds.has(entry.target.instanceId)
        })),
        randomUUID(),
        registeredRoots
      )
    }
  })
  const unsubscribePublicSessionRoutes = subscribePublicSessionRoutes(visibility, sessionSource)
  const quota = new CoworkingQuotaProjection({
    getCachedActiveRateLimitState: () => options.rateLimits.getState(),
    subscribeCachedActiveRateLimitState: (listener) => options.rateLimits.onStateChange(listener)
  })
  const shareCatalog = new CoworkingShareCatalog(
    options.ownerRuntimeId,
    visibility,
    new CoworkingOwnerShareSource(options.store, options.runtime, sessions),
    quota
  )
  const access = new CoworkingAccessAuthority({
    ownerRuntimeId: options.ownerRuntimeId,
    isPublic: (instanceId, shareEpoch) => visibility.isPublic(instanceId, shareEpoch)
  })
  const terminalAttachments = new CoworkingTerminalAttachmentRegistry()
  const execution = new CoworkingExecutionGateway({
    resolveAdapter: host.resolveAdapter,
    revalidateTarget: async (target) => {
      const current = await visibility.revalidateMutationTarget(
        target.worktree.instanceId,
        target.worktree.shareEpoch
      )
      return current?.worktreeId === target.worktree.worktreeId
    },
    captureControlGeneration: (target) =>
      access.requireControl(
        target.connectionId,
        target.worktree.instanceId,
        target.worktree.shareEpoch
      ).grantId
  })
  const registry = createDefaultCoworkingRpcRegistry({
    catalog: shareCatalog,
    visibility,
    access,
    execution,
    sessions,
    attachments: terminalAttachments
  })
  const gateway = new CoworkingRpcGateway({
    ownerRuntimeId: options.ownerRuntimeId,
    registry,
    authorize: (methodAccess, bound, principal) =>
      authorizeCoworkingRpcInvocation(methodAccess, bound, access, principal.connectionId),
    onConnectionOpened: (principal) => {
      access.connectionOpened(principal)
      shareCatalog.openProjection(principal)
    },
    onConnectionClosed: (connectionId) => {
      // Why: revoke authority first; downstream cleanup errors must never leave
      // a grant alive after its physical connection has closed.
      try {
        access.connectionClosed(connectionId)
      } finally {
        try {
          execution.closeConnection(connectionId)
        } finally {
          try {
            terminalAttachments.closeConnection(connectionId)
          } finally {
            shareCatalog.closeProjection(connectionId)
          }
        }
      }
    }
  })
  const unsubscribeVisibilityConnections = visibility.subscribe((change) => {
    if (change.kind === 'invalidated') {
      // Why: encrypted frames already parked behind WebSocket backpressure
      // cannot be selectively purged, so invalidate the physical channel.
      gateway.disconnectAll('Worktree publication changed')
    }
  })
  const { tailnet, keypair, tickets, probe, ownerCatalog, firewallEnvironment } =
    createCoworkingPeerConnectivity({
      userDataPath: options.userDataPath,
      ownerRuntimeId: options.ownerRuntimeId,
      yiruVersion: options.yiruVersion,
      osFamily: options.osFamily,
      isPackaged: options.isPackaged,
      executablePath: options.executablePath
    })
  let service: CoworkingOwnerService | null = null
  let composition: CoworkingOwnerComposition | null = null
  const ingress = new CoworkingIngress({
    tailnet,
    probe,
    tickets,
    keypair,
    gateway,
    ownerRuntimeId: options.ownerRuntimeId,
    ownerKeyFingerprint: keypair.fingerprint,
    onUnavailable: (error) => void service?.reportIngressUnavailable(error),
    onSelfIdentity: (self) =>
      service?.reportSelfIdentity({
        nodeDisplayName: self.nodeDisplayName,
        userDisplayName: self.userDisplayName
      })
  })
  service = new CoworkingOwnerService({
    visibility,
    access,
    shareCatalog,
    ownerCatalog,
    ingress,
    prepareIngress: () =>
      assertWindowsCoworkingFirewallReady(COWORKING_INGRESS_PORT, firewallEnvironment),
    windowsFirewall: {
      inspect: () => inspectWindowsCoworkingFirewall(COWORKING_INGRESS_PORT, firewallEnvironment),
      repair: () => repairWindowsCoworkingFirewall(COWORKING_INGRESS_PORT, firewallEnvironment)
    },
    onAvailabilityRecovered: () => composition?.recoverAfterAvailability() ?? Promise.resolve(),
    describeOwnerWorktree: (worktreeId) =>
      resolveCoworkingOwnerWorktreeDescriptor(options.store, worktreeId)
  })
  const unsubscribeProvenance = visibility.subscribe((change) => {
    if (
      change.kind === 'invalidated' &&
      (change.reason === 'deleted' || change.reason === 'incarnation-changed')
    ) {
      provenance.purgeWorktree(change.instanceId)
    }
  })
  let previousGrants = new Map<string, { connectionId: string; instanceId: string }>()
  const unsubscribeGrantCleanup = access.subscribeGrants((grants) => {
    const current = new Map(
      grants.map((grant) => [
        grant.grantId,
        { connectionId: grant.connectionId, instanceId: grant.instanceId }
      ])
    )
    for (const [grantId, grant] of previousGrants) {
      if (!current.has(grantId)) {
        execution.revokeWorktree(grant.connectionId, grant.instanceId)
      }
    }
    previousGrants = current
  })
  composition = new CoworkingOwnerComposition(
    service,
    options.store,
    catalog,
    visibility,
    sessions,
    [
      unsubscribePublicSessionRoutes,
      unsubscribeVisibilityConnections,
      unsubscribeProvenance,
      unsubscribeGrantCleanup
    ],
    options.runtime
  )
  return composition
}
