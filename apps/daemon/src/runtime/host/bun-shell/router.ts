import type { Store } from '~main/persistence/store'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import { shellAiVaultRuntimeHandlers } from '~main/runtime/rpc/orpc/router-direct/shell/ai-vault'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import type { DaemonRestart } from '~main/server/restart'
import { createStarNagHandlers } from '~main/star-nag/handlers'
import type { StatsCollector } from '~main/stats/collector'

import { createBunShellAccountHandlers } from './accounts'
import { createBunShellCrashReportHandlers } from './crash-reports'
import { createBunShellDeveloperPermissionHandlers } from './developer-permissions'
import { createBunShellDiagnosticsHandlers } from './diagnostics'
import { BunShellEventChannel } from './event-channel'
import { createBunShellFeedbackHandlers } from './feedback'
import { createBunShellFileHandlers } from './files'
import { createBunShellGitHubHandlers } from './github'
import { createBunShellMobileHandlers } from './mobile'
import { createBunShellPlatformHandlers, type BunShellPlatformActions } from './platform'
import { createBunShellRepoHostHandlers } from './repo-host'
import { createBunShellStateHandlers } from './state'
import { createBunShellSystemHandlers } from './system'
import { createBunShellToolHandlers } from './tools'
import { createBunShellUpdaterHandlers } from './updater'

export function createBunShellHandlers(options: {
  runtime: YiruRuntimeService
  platformActions: BunShellPlatformActions
  readMobileEndpoint: () => string | null
  restartDaemon: DaemonRestart
  store: Store
  stats: StatsCollector
  userDataPath: string
}) {
  const events = new BunShellEventChannel()
  options.store.onSettingsChanged(() => {
    events.publish({ type: 'settingsChanged' })
  })
  return {
    ...createBunShellAccountHandlers(),
    ...createBunShellCrashReportHandlers(options.userDataPath),
    ...createBunShellDeveloperPermissionHandlers(),
    ...createBunShellDiagnosticsHandlers(options.platformActions.openFilePath),
    ...createBunShellFeedbackHandlers(),
    ...shellAiVaultRuntimeHandlers,
    ...createBunShellFileHandlers(options.store),
    ...createBunShellGitHubHandlers(),
    ...createBunShellMobileHandlers(options.readMobileEndpoint),
    ...createBunShellPlatformHandlers(options.platformActions),
    ...createBunShellRepoHostHandlers(),
    ...createBunShellStateHandlers(
      options.store,
      options.userDataPath,
      options.restartDaemon,
      (event) => events.publish(event)
    ),
    ...createStarNagHandlers({
      store: options.store,
      stats: options.stats,
      hasAudience: () => events.hasSubscribers(),
      publish: (event) => events.publish(event)
    }),
    ...createBunShellSystemHandlers(options.runtime, options.restartDaemon),
    ...createBunShellToolHandlers(),
    ...createBunShellUpdaterHandlers(options.restartDaemon, (event) => events.publish(event)),
    events: {
      subscribe: runtimeImplementation.shell.events.subscribe.handler(async function* ({
        input,
        signal
      }) {
        for await (const event of events.subscribe(input.lastSeenSeq, signal)) {
          yield event
        }
      })
    }
  }
}
