import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { SPOOL_INGRESS_PORT, type SpoolOsFamily } from '../../shared/spool/spool-wire-contract'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { Store } from '../persistence'
import type { RateLimitService } from '../rate-limits/service'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { SpoolAccessAuthority } from './spool-access-authority'
import { SpoolDesktopCatalog } from './spool-desktop-catalog'
import { SpoolDesktopComposition } from './spool-desktop-lifecycle'
import { SpoolDesktopService } from './spool-desktop-service'
import { loadOrCreateSpoolE2EEKeypair } from './spool-e2ee-keypair'
import { SpoolExecutionGateway } from './spool-execution-gateway'
import { SpoolIngress } from './spool-ingress'
import { SpoolProbeService } from './spool-ingress-probe'
import { SpoolLegacySessionAttestor } from './spool-legacy-session-attestor'
import { SpoolMobileVaultSessionSource } from './spool-mobile-vault-session-source'
import { createOrcaSpoolHostAdapter } from './spool-orca-host-adapter'
import { SpoolOwnerShareSource } from './spool-owner-share-source'
import { DefaultSpoolOwnerWorktreeCatalog } from './spool-owner-worktree-catalog'
import { OrcaSpoolPairedRuntimeHostAdapter } from './spool-paired-runtime-host-adapter'
import { OrcaSpoolPairedRuntimeSessionReader } from './spool-paired-runtime-session-reader'
import { listSpoolPairedRuntimeWorktrees } from './spool-paired-runtime-worktree-catalog'
import { HttpSpoolProbeClient } from './spool-probe-client'
import { SpoolQuotaProjection } from './spool-quota-projection'
import { authorizeSpoolRpcInvocation, createDefaultSpoolRpcRegistry } from './spool-rpc-registry'
import { SpoolRpcGateway } from './spool-rpc-gateway'
import { SpoolSessionCatalog } from './spool-session-catalog'
import { SpoolCanonicalHistoricalSessionConsistency } from './spool-historical-session-consistency'
import { SpoolSessionProvenanceIndex } from './spool-session-provenance-index'
import { SpoolActualHostSessionRootMatcher } from './spool-session-root-matcher'
import { SpoolShareCatalog } from './spool-share-catalog'
import { SpoolTicketAuthority } from './spool-ticket-authority'
import { DefaultTailnetPeerDirectory } from './tailnet-peer-directory'
import { TailscaleCommandAdapter } from './tailscale-command-adapter'
import { SpoolVisibilityDenyJournal } from './spool-visibility-deny-journal'
import { SpoolWorktreeIncarnation, type SpoolOwnerWorktree } from './spool-worktree-incarnation'
import { SpoolActualHostWorktreeIncarnationHost } from './spool-worktree-incarnation-host'
import { SpoolWorktreeVisibility } from './spool-worktree-visibility'
import {
  assertWindowsSpoolFirewallReady,
  inspectWindowsSpoolFirewall,
  repairWindowsSpoolFirewall
} from './spool-windows-firewall'

const VISIBILITY_DENY_FILENAME = 'spool-visibility-deny.json'

export { SpoolDesktopComposition } from './spool-desktop-lifecycle'

export type SpoolDesktopCompositionOptions = {
  store: Store
  runtime: OrcaRuntimeService
  rateLimits: Pick<RateLimitService, 'getState' | 'onStateChange'>
  userDataPath: string
  profileId: string
  ownerRuntimeId: string
  orcaVersion: string
  osFamily: SpoolOsFamily
  isPackaged: boolean
  executablePath: string
}

export function createSpoolDesktopComposition(
  options: SpoolDesktopCompositionOptions
): SpoolDesktopComposition {
  const catalog = new DefaultSpoolOwnerWorktreeCatalog({
    store: options.store,
    runtime: options.runtime,
    listRuntimeWorktrees: (environmentId, repo) =>
      listSpoolPairedRuntimeWorktrees(options.userDataPath, environmentId, repo)
  })
  let host: ReturnType<typeof createOrcaSpoolHostAdapter> | undefined
  const pairedRuntimeAdapter = new OrcaSpoolPairedRuntimeHostAdapter({
    userDataPath: options.userDataPath,
    resolveOwnerHistoricalRecord: (ownerRecordKey) =>
      host?.sessionRecords.resolve(ownerRecordKey) ?? null
  })
  const pairedRuntimeSessionReader = new OrcaSpoolPairedRuntimeSessionReader({
    userDataPath: options.userDataPath
  })
  const resolveLocalWslDistro = (target: SpoolOwnerWorktree): string | null => {
    const repo = options.store.getRepo(target.repoId)
    if (!repo || repo.connectionId) {
      return null
    }
    return getLocalProjectWorktreeGitOptions(options.store, repo).wslDistro ?? null
  }
  const incarnationHost = new SpoolActualHostWorktreeIncarnationHost({
    pairedRuntimeAdapter,
    resolveLocalWslDistro
  })
  const incarnation = new SpoolWorktreeIncarnation(incarnationHost)
  const roots = new SpoolActualHostSessionRootMatcher(incarnationHost)
  host = createOrcaSpoolHostAdapter({
    store: options.store,
    runtime: options.runtime,
    pairedRuntimeAdapter,
    pairedRuntimeSessionReader
  })
  const provenance = new SpoolSessionProvenanceIndex(options.userDataPath)
  const sessionSource = new SpoolMobileVaultSessionSource(
    host.sessionReader,
    host.sessionRecords,
    host.continuedSessions,
    resolveLocalWslDistro
  )
  const sessions = new SpoolSessionCatalog(
    provenance,
    sessionSource,
    new SpoolCanonicalHistoricalSessionConsistency(catalog, incarnation, roots)
  )
  const attestor = new SpoolLegacySessionAttestor(provenance, sessionSource, roots)
  const visibility = new SpoolWorktreeVisibility({
    store: options.store,
    denyJournal: new SpoolVisibilityDenyJournal(
      join(options.userDataPath, VISIBILITY_DENY_FILENAME),
      options.profileId
    ),
    catalog,
    incarnation,
    prepareFirstPublication: async (entries, registeredRoots, refreshInstanceIds) => {
      return await attestor.prepareFirstPublications(
        entries.map((entry) => ({
          target: entry.target,
          spoolIncarnationId: entry.markerId,
          root: entry.root,
          forceRefresh: refreshInstanceIds.has(entry.target.instanceId)
        })),
        randomUUID(),
        registeredRoots
      )
    }
  })
  const quota = new SpoolQuotaProjection({
    getCachedActiveRateLimitState: () => options.rateLimits.getState(),
    subscribeCachedActiveRateLimitState: (listener) => options.rateLimits.onStateChange(listener)
  })
  const shareCatalog = new SpoolShareCatalog(
    options.ownerRuntimeId,
    visibility,
    new SpoolOwnerShareSource(options.store, options.runtime, sessions),
    quota
  )
  const access = new SpoolAccessAuthority({
    ownerRuntimeId: options.ownerRuntimeId,
    isPublic: (instanceId, shareEpoch) => visibility.isPublic(instanceId, shareEpoch)
  })
  const execution = new SpoolExecutionGateway({
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
  const registry = createDefaultSpoolRpcRegistry({
    catalog: shareCatalog,
    visibility,
    access,
    execution,
    sessions
  })
  const gateway = new SpoolRpcGateway({
    ownerRuntimeId: options.ownerRuntimeId,
    registry,
    authorize: (methodAccess, bound, principal) =>
      authorizeSpoolRpcInvocation(methodAccess, bound, access, principal.connectionId),
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
          shareCatalog.closeProjection(connectionId)
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
  const tailnet = new TailscaleCommandAdapter()
  const keypair = loadOrCreateSpoolE2EEKeypair(options.userDataPath)
  const tickets = new SpoolTicketAuthority()
  const probe = new SpoolProbeService({
    tailnet,
    tickets,
    keypair,
    ownerRuntimeId: options.ownerRuntimeId,
    orcaVersion: options.orcaVersion,
    osFamily: options.osFamily
  })
  const probeClient = new HttpSpoolProbeClient()
  const desktopCatalog = new SpoolDesktopCatalog(
    new DefaultTailnetPeerDirectory(tailnet, probeClient),
    probeClient
  )
  let service: SpoolDesktopService | null = null
  let composition: SpoolDesktopComposition | null = null
  const ingress = new SpoolIngress({
    tailnet,
    probe,
    tickets,
    keypair,
    gateway,
    ownerRuntimeId: options.ownerRuntimeId,
    ownerKeyFingerprint: keypair.fingerprint,
    onUnavailable: (error) => void service?.reportIngressUnavailable(error)
  })
  const firewallEnvironment = {
    platform: process.platform,
    isPackaged: options.isPackaged,
    executablePath: options.executablePath,
    systemRoot: process.env.SystemRoot
  }
  service = new SpoolDesktopService({
    visibility,
    access,
    shareCatalog,
    desktopCatalog,
    ingress,
    prepareIngress: () => assertWindowsSpoolFirewallReady(SPOOL_INGRESS_PORT, firewallEnvironment),
    windowsFirewall: {
      inspect: () => inspectWindowsSpoolFirewall(SPOOL_INGRESS_PORT, firewallEnvironment),
      repair: () => repairWindowsSpoolFirewall(SPOOL_INGRESS_PORT, firewallEnvironment)
    },
    onAvailabilityRecovered: () => composition?.recoverAfterAvailability() ?? Promise.resolve(),
    describeOwnerWorktree: (worktreeId) => {
      const meta = options.store.getWorktreeMeta(worktreeId)
      return meta
        ? {
            displayName: meta.displayName,
            projectId: meta.projectId ?? null
          }
        : null
    }
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
  composition = new SpoolDesktopComposition(
    service,
    options.store,
    catalog,
    visibility,
    sessions,
    [unsubscribeVisibilityConnections, unsubscribeProvenance, unsubscribeGrantCleanup],
    options.runtime
  )
  return composition
}
