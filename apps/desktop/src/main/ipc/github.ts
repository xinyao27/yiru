import { webContents } from 'electron'

import { registerGitHubShellHandlers } from '../github/github'
import type { Store } from '../persistence'
import type { StatsCollector } from '../stats/collector'
import { electronIpcRegistration } from './electron-ipc-registration'

// Why: GitHub capability handlers are host-portable. Electron owns only the
// IPC registration and live-renderer enumeration needed by the shell refresh
// adapter, so importing the capability directory in a Node host stays safe.
export function registerGitHubIpcHandlers(store: Store, stats: StatsCollector): void {
  registerGitHubShellHandlers(
    electronIpcRegistration,
    {
      getLiveRendererIds: () =>
        new Set(
          webContents
            .getAllWebContents()
            .filter((renderer) => !renderer.isDestroyed())
            .map((renderer) => renderer.id)
        )
    },
    store,
    stats
  )
}
