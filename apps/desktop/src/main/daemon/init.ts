import { unlinkSync } from 'node:fs'

import { agentHookServer } from '../agent-hooks/server'
import {
  confirmSeededClaudeLivePtys,
  hasSeededUnconfirmedClaudePtys
} from '../claude/accounts/live-pty-gate'
import {
  getLocalPtyProvider,
  rebindLocalProviderListeners,
  setLocalPtyProvider,
  unbindLocalProviderListeners
} from '../pty/pty'
import { isStartupDiagnosticsEnabled, logStartupDiagnostic } from '../startup/diagnostics'
import { DegradedDaemonPtyProvider } from './degraded-daemon-pty-provider'
import { collectPinnedDaemonVersions, pruneOldDaemonHosts } from './host-relocation'
import { cleanupDaemonForProtocol, createLegacyDaemonAdapters } from './process-cleanup'
import { createOutOfProcessLauncher } from './process-launcher'
import { DaemonPtyAdapter } from './pty-adapter'
import { DaemonPtyRouter } from './pty-router'
import type { DaemonRuntimeHostOptions } from './runtime-host-options'
import { getDaemonHistoryDir, getDaemonRuntimeDir } from './runtime-paths'
import { DaemonSpawner, getDaemonPidPath } from './spawner'
import { PROTOCOL_VERSION } from './types'

export { cleanupDaemonForProtocol } from './process-cleanup'
export type { OrphanedDaemonCleanupResult } from './process-cleanup'
export { WEDGED_DAEMON_GRACE_RETRIES } from './process-launcher'
export type { DaemonRuntimeHostOptions } from './runtime-host-options'

type DaemonProvider = DaemonPtyRouter | DaemonPtyAdapter | DegradedDaemonPtyProvider

let spawner: DaemonSpawner | null = null
let adapter: DaemonProvider | null = null
let runtimeHostOptions: DaemonRuntimeHostOptions = {}
let restartInFlight: Promise<RestartDaemonResult> | null = null

export async function initDaemonPtyProvider(
  signal?: AbortSignal,
  options: DaemonRuntimeHostOptions = {}
): Promise<void> {
  runtimeHostOptions = options
  logDaemonMilestone('daemon-init-start')
  const runtimeDir = getDaemonRuntimeDir()
  const nextSpawner = new DaemonSpawner({
    runtimeDir,
    launcher: createOutOfProcessLauncher(runtimeDir, options)
  })
  const info = await nextSpawner.ensureRunning()
  pruneOldDaemonHosts(collectPinnedDaemonVersions(runtimeDir))
  const launchMode = nextSpawner.getHandle()?.mode
  logDaemonMilestone('daemon-current-ready')
  if (signal?.aborted) {
    return
  }

  const nextAdapter = new DaemonPtyAdapter({
    socketPath: info.socketPath,
    tokenPath: info.tokenPath,
    historyPath: getDaemonHistoryDir(),
    onAgentHook: ingestDaemonAgentHook,
    respawn: async () => {
      console.warn('[daemon] Daemon process died — respawning')
      nextSpawner.resetHandle()
      await nextSpawner.ensureRunning()
    }
  })
  await syncDaemonAgentHookHost(nextAdapter, options.agentHookHost)
  const legacyAdapters = await createLegacyDaemonAdapters(runtimeDir)
  const routedAdapter = createRoutedProvider(
    nextAdapter,
    legacyAdapters,
    launchMode === 'degraded-new-pty-fallback'
  )
  if (routedAdapter instanceof DegradedDaemonPtyProvider) {
    await routedAdapter.discoverDaemonSessions()
  } else if (routedAdapter instanceof DaemonPtyRouter) {
    await routedAdapter.discoverLegacySessions()
  }
  if (signal?.aborted) {
    return
  }

  spawner = nextSpawner
  adapter = routedAdapter
  setLocalPtyProvider(routedAdapter)
  rebindLocalProviderListeners()
  logDaemonMilestone('daemon-init-done', { legacyAdapters: legacyAdapters.length })
  await reconcileSeededClaudeLivePtys(routedAdapter)
}

export function getDaemonProvider(): DaemonProvider | null {
  return adapter
}

export function replaceDaemonProvider(nextAdapter: DaemonProvider): void {
  adapter = nextAdapter
  setLocalPtyProvider(nextAdapter)
}

export type RestartDaemonResult = {
  killedCount: number
}

export async function restartDaemon(): Promise<RestartDaemonResult> {
  if (restartInFlight) {
    return restartInFlight
  }
  restartInFlight = runRestartDaemon().finally(() => {
    restartInFlight = null
  })
  return restartInFlight
}

async function runRestartDaemon(): Promise<RestartDaemonResult> {
  const currentSpawner = spawner
  const currentProvider = adapter
  if (!currentSpawner || !currentProvider) {
    throw new Error('restartDaemon called before initDaemonPtyProvider')
  }

  const currentAdapter = getCurrentDaemonAdapter(currentProvider)
  const legacyAdapters = getLegacyDaemonAdapters(currentProvider)
  const fallbackKilledCount =
    currentProvider instanceof DegradedDaemonPtyProvider
      ? await currentProvider.shutdownFallbackSessions()
      : 0
  const degradedSessionIds =
    currentProvider instanceof DegradedDaemonPtyProvider
      ? currentProvider.getCurrentDaemonSessionIds()
      : []
  const killedCount =
    new Set([...currentAdapter.getActiveSessionIds(), ...degradedSessionIds]).size +
    fallbackKilledCount
  currentAdapter.fanoutSyntheticExits(-1)
  if (currentProvider instanceof DegradedDaemonPtyProvider) {
    currentProvider.fanoutCurrentDaemonSyntheticExits(-1)
  }

  unbindLocalProviderListeners()
  await cleanupDaemonForProtocol(getDaemonRuntimeDir(), PROTOCOL_VERSION)
  currentSpawner.resetHandle()
  const info = await currentSpawner.ensureRunning()
  const nextAdapter = new DaemonPtyAdapter({
    socketPath: info.socketPath,
    tokenPath: info.tokenPath,
    historyPath: getDaemonHistoryDir(),
    onAgentHook: ingestDaemonAgentHook,
    respawn: async () => {
      console.warn('[daemon] Daemon process died — respawning')
      currentSpawner.resetHandle()
      await currentSpawner.ensureRunning()
    }
  })
  await syncDaemonAgentHookHost(nextAdapter, runtimeHostOptions.agentHookHost)
  const nextProvider =
    legacyAdapters.length > 0
      ? new DaemonPtyRouter({ current: nextAdapter, legacy: legacyAdapters })
      : nextAdapter
  if (nextProvider instanceof DaemonPtyRouter) {
    await nextProvider.discoverLegacySessions()
  }
  disposeProviderSubscriptionsOnly(currentProvider)
  replaceDaemonProvider(nextProvider)
  rebindLocalProviderListeners()
  return { killedCount }
}

export async function disconnectDaemon(): Promise<void> {
  await adapter?.disconnectOnly()
  adapter = null
}

export async function shutdownDaemon(): Promise<void> {
  adapter?.dispose()
  adapter = null
  await spawner?.shutdown()
  spawner = null
  try {
    unlinkSync(getDaemonPidPath(getDaemonRuntimeDir()))
  } catch {
    // Why: a daemon without a pid file is already clean from the caller's perspective.
  }
}

function createRoutedProvider(
  current: DaemonPtyAdapter,
  legacy: DaemonPtyAdapter[],
  isDegraded: boolean
): DaemonProvider {
  if (isDegraded) {
    return new DegradedDaemonPtyProvider({
      current,
      legacy,
      fallback: getLocalPtyProvider()
    })
  }
  return legacy.length > 0 ? new DaemonPtyRouter({ current, legacy }) : current
}

function ingestDaemonAgentHook(envelope: Parameters<typeof agentHookServer.ingestRemote>[0]): void {
  agentHookServer.ingestRemote(envelope, null)
}

async function syncDaemonAgentHookHost(
  targetAdapter: DaemonPtyAdapter,
  config?: { endpointDir: string; env: string }
): Promise<void> {
  try {
    agentHookServer.setForwardedPtyEnv(await targetAdapter.initializeAgentHookHost(config))
  } catch (error) {
    agentHookServer.setForwardedPtyEnv({})
    console.warn('[daemon] Agent hook host unavailable:', error)
  }
}

async function reconcileSeededClaudeLivePtys(provider: DaemonProvider): Promise<void> {
  if (!hasSeededUnconfirmedClaudePtys()) {
    return
  }
  try {
    const providers =
      provider instanceof DaemonPtyRouter || provider instanceof DegradedDaemonPtyProvider
        ? provider.getAllAdapters()
        : [provider]
    const results = await Promise.allSettled(providers.map((entry) => entry.listSessions()))
    if (results.some((result) => result.status === 'rejected')) {
      console.warn('[daemon] Keeping seeded Claude live-PTY gate — session listing failed')
      return
    }
    confirmSeededClaudeLivePtys(
      results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.map((session) => session.sessionId) : []
      )
    )
  } catch (error) {
    console.warn('[daemon] Failed to reconcile seeded Claude live-PTY gate:', error)
  }
}

function getCurrentDaemonAdapter(provider: DaemonProvider): DaemonPtyAdapter {
  return provider instanceof DaemonPtyRouter || provider instanceof DegradedDaemonPtyProvider
    ? provider.getCurrentAdapter()
    : provider
}

function getLegacyDaemonAdapters(provider: DaemonProvider): DaemonPtyAdapter[] {
  return provider instanceof DaemonPtyRouter || provider instanceof DegradedDaemonPtyProvider
    ? [...provider.getLegacyAdapters()]
    : []
}

function disposeProviderSubscriptionsOnly(provider: DaemonProvider): void {
  if (provider instanceof DaemonPtyRouter) {
    provider.disposeRouterOnly()
  } else if (provider instanceof DegradedDaemonPtyProvider) {
    provider.disposeProviderOnly()
  }
}

function logDaemonMilestone(event: string, details: Record<string, unknown> = {}): void {
  if (isStartupDiagnosticsEnabled()) {
    logStartupDiagnostic(event, { t: Math.round(performance.now()), ...details })
  }
}
