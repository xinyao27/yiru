import { webContents } from 'electron'

import { initializeShellGitHubService } from '../github/github'
import type { Store } from '../persistence'
import type { StatsCollector } from '../stats/collector'

export function initializeShellGitHubWindowService(store: Store, stats: StatsCollector): void {
  initializeShellGitHubService(
    {
      getLiveRendererIds: () =>
        new Set(
          webContents
            .getAllWebContents()
            .filter((renderer) => !renderer.isDestroyed())
            .map((renderer) => renderer.id)
        ),
      onRendererDestroyed: (rendererId, callback) => {
        webContents.fromId(rendererId)?.once('destroyed', callback)
      }
    },
    store,
    stats
  )
}
