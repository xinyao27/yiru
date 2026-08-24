import { app } from 'electron'

import type { AgentAwakeService } from '../agent-awake-service'
import { agentHookServer } from '../agent-hooks/server'
import { wslHookRelayManager } from '../agent-hooks/wsl-hook-relay-manager'
import { browserManager } from '../browser/manager'
import type { CoworkingOwnerComposition } from '../coworking/owner/composition'
import { disconnectDaemon, shutdownDaemon } from '../daemon/init'
import { setUnreadDockBadgeCount } from '../dock/unread-badge'
import { shutdownObservability } from '../observability/service'
import type { Store } from '../persistence'
import { getCanonicalUserDataPath } from '../persistence'
import { killAllPty } from '../pty/pty'
import type { RateLimitService } from '../rate-limits/service'
import { clearRuntimeMetadataIfOwned } from '../runtime/metadata'
import type { YiruRuntimeRpcServer } from '../runtime/rpc'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { awaitRuntimeFileWatcherUnsubscribes } from '../runtime/yiru-runtime-files'
import type { StarNagService } from '../star-nag/service'
import type { StatsCollector } from '../stats/collector'
import { shutdownTelemetry } from '../telemetry/client'
import { destroySystemTray } from '../tray/system-tray'
import { isQuittingForUpdate } from '../updater'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import { disposeWorktreeBaseDirectoryWatchers } from '../worktree/base-directory-watcher'
import { isDevParentShutdownRequested } from './configure-process'
import { shouldQuitWhenAllWindowsClosed } from './window-all-closed-quit-policy'

type ShutdownServices = {
  store: Store | null
  stats: StatsCollector | null
  starNag: StarNagService | null
  runtime: YiruRuntimeService | null
  runtimeRpc: YiruRuntimeRpcServer | null
  coworkingOwner: CoworkingOwnerComposition | null
  unregisterCoworkingSharingController: (() => void) | null
  rateLimits: RateLimitService | null
  agentAwakeService: AgentAwakeService | null
  unsubscribeSystemResumeBroadcast: (() => void) | null
  unsubscribeWindowFocusBroadcast: (() => void) | null
  unsubscribeAgentAwakeStatusChanges: (() => void) | null
}

export function registerAppShutdown(options: {
  isServeMode: boolean
  isQuitting: () => boolean
  setQuitting: () => void
  getServices: () => ShutdownServices
}): void {
  let beforeQuitCleanupDone = false
  let daemonDisconnectDone = false
  let watcherShutdown: Promise<void> | null = null

  const shutdownWatchers = (): Promise<void> => {
    watcherShutdown ??= Promise.allSettled([disposeWorktreeBaseDirectoryWatchers()]).then(
      (results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            console.error('[filesystem-watcher] shutdown failed:', result.reason)
          }
        }
      }
    )
    return watcherShutdown
  }

  app.on('before-quit', () => {
    if (isQuittingForUpdate()) {
      recordUpdaterLifecycle('before_quit_allowed', undefined, {
        message: 'before-quit allowed for update install'
      })
    }
    options.setQuitting()
    if (beforeQuitCleanupDone) {
      return
    }
    beforeQuitCleanupDone = true
    const services = options.getServices()
    services.unsubscribeSystemResumeBroadcast?.()
    services.unsubscribeWindowFocusBroadcast?.()
    services.unsubscribeAgentAwakeStatusChanges?.()
    services.agentAwakeService?.dispose()
    services.rateLimits?.stop()
  })

  app.on('will-quit', (event) => {
    const services = options.getServices()
    if (isQuittingForUpdate()) {
      recordUpdaterLifecycle(
        'will_quit_cleanup_started',
        { daemonTeardown: 'disconnect' },
        { message: 'will-quit cleanup for update install; daemonTeardown=disconnect' }
      )
    }
    destroySystemTray()
    services.starNag?.stop()
    setUnreadDockBadgeCount(0)
    agentHookServer.stop()
    wslHookRelayManager.disposeAll()
    services.stats?.flush()
    services.runtime?.getAgentBrowserBridge()?.destroyAllSessions()
    const offscreenBrowserShutdown =
      services.runtime?.getBrowserBackend()?.destroyAll?.() ?? Promise.resolve()
    browserManager.setBrowserGuestStateChangedListener(null)
    const emulatorShutdown =
      services.runtime?.getEmulatorBridge()?.destroyAllSessions() ?? Promise.resolve()
    killAllPty()
    const watchers = shutdownWatchers()
    services.store?.flush()

    if (daemonDisconnectDone) {
      return
    }
    event.preventDefault()
    services.unregisterCoworkingSharingController?.()
    const ownedPid = process.pid
    const ownedRuntimeId = services.runtime?.getRuntimeId()
    const rpcStopAndClear = services.runtimeRpc
      ? services.runtimeRpc
          .stop()
          .then(() => awaitRuntimeFileWatcherUnsubscribes())
          .then(() => {
            if (ownedRuntimeId) {
              clearRuntimeMetadataIfOwned(getCanonicalUserDataPath(), ownedPid, ownedRuntimeId)
            }
          })
          .catch((error) => {
            console.error('[runtime] Failed to stop local RPC transport:', error)
          })
      : Promise.resolve()
    const coworkingStop = services.coworkingOwner
      ? services.coworkingOwner.stop().catch((error) => {
          console.error('[coworking] Failed to stop Desktop sharing:', error)
        })
      : Promise.resolve()
    const daemonTeardown = isDevParentShutdownRequested() ? shutdownDaemon() : disconnectDaemon()
    void Promise.allSettled([
      daemonTeardown,
      rpcStopAndClear,
      coworkingStop,
      watchers,
      emulatorShutdown,
      offscreenBrowserShutdown
    ])
      .then(() => shutdownTelemetry())
      .then(() => shutdownObservability())
      .catch(() => undefined)
      .then(() => {
        daemonDisconnectDone = true
        app.quit()
      })
  })

  app.on('window-all-closed', () => {
    if (
      shouldQuitWhenAllWindowsClosed({
        platform: process.platform,
        isQuitting: options.isQuitting(),
        isServeMode: options.isServeMode
      })
    ) {
      app.quit()
    }
  })
}
