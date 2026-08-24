import { HEADLESS_RUNTIME_WINDOW_ID } from '~shared/runtime-types'

import { browserManager } from '../browser/manager'
import { OffscreenBrowserBackend } from '../browser/offscreen-browser-backend'
import type { ClaudeRuntimeAuthService } from '../claude/accounts/runtime-auth-service'
import { CliInstaller } from '../cli/installer'
import type { Store } from '../persistence'
import { registerHeadlessPtyRuntime } from '../pty/pty'
import type { YiruRuntimeRpcServer } from '../runtime/rpc'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { notifyServeSupervisorReady } from '../serve-update-handoff'
import { logStartupMilestone } from '../startup/diagnostics'
import type { ManagedWslCliStartup } from '../startup/managed-wsl-cli-startup'
import { setupAutoUpdater } from '../updater'
import {
  scheduleWorktreeBaseDirectoryWatcherSync,
  setWorktreeBaseDirectoryWatcherSyncContext
} from '../worktree/base-directory-watcher'
import { installServeSignalHandlers, printServeReady, type ServeOptions } from './readiness'

export async function startHeadlessRuntime(options: {
  serveOptions: ServeOptions
  store: Store
  runtime: YiruRuntimeService
  runtimeRpc: YiruRuntimeRpcServer
  claudeRuntimeAuth: ClaudeRuntimeAuthService
  prepareForCodexLaunch: Parameters<typeof registerHeadlessPtyRuntime>[1]
  localPtyReady: Promise<void>
  managedWslCliStartup: ManagedWslCliStartup
  headlessBrowserDisplayAvailable: boolean
  settleDesktopActivation: () => void
}): Promise<void> {
  setupAutoUpdater(
    { webContents: {} },
    {
      getLastUpdateCheckAt: () => options.store.getUI().lastUpdateCheckAt,
      onBeforeQuit: () => options.store.flush(),
      setLastUpdateCheckAt: (timestamp) => options.store.updateUI({ lastUpdateCheckAt: timestamp })
    }
  )
  setWorktreeBaseDirectoryWatcherSyncContext(options.store)
  scheduleWorktreeBaseDirectoryWatcherSync(options.store)
  logStartupMilestone('wsl-cli-barrier-start')
  await options.managedWslCliStartup.waitForStartupBarrier()
  logStartupMilestone('wsl-cli-barrier-resolved', {
    reconciliation: options.managedWslCliStartup.getStatus()
  })
  await options.localPtyReady
  registerHeadlessPtyRuntime(
    options.runtime,
    options.prepareForCodexLaunch,
    () => options.store.getSettings(),
    (target) => options.claudeRuntimeAuth.prepareForClaudeLaunch(target),
    options.store
  )
  if (options.headlessBrowserDisplayAvailable) {
    options.runtime.setBrowserBackend(new OffscreenBrowserBackend(browserManager))
  }
  options.runtime.syncWindowGraph(HEADLESS_RUNTIME_WINDOW_ID, { tabs: [], leaves: [] })
  await options.runtimeRpc.start().catch((error) => {
    console.error('[runtime] Failed to start headless RPC transport:', error)
    throw error
  })
  options.settleDesktopActivation()
  installServeSignalHandlers()
  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const cliStatus = await new CliInstaller({
        privilegedRunner: async () => {
          throw new Error('serve CLI auto-install must not request administrator privileges')
        }
      }).install()
      console.log(
        `[serve] yiru CLI install: ${cliStatus.state}${cliStatus.commandPath ? ` (${cliStatus.commandPath})` : ''}`
      )
    } catch (error) {
      console.warn(
        '[serve] yiru CLI install skipped:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
  await printServeReady(options.serveOptions, {
    runtime: options.runtime,
    runtimeRpc: options.runtimeRpc,
    managedWslCliReconciliation: options.managedWslCliStartup.getStatus()
  })
  notifyServeSupervisorReady(options.runtime.getRuntimeId())
}
