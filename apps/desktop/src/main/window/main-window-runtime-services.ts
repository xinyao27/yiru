import type { BrowserWindow } from 'electron'

import { preserveAgentAuthBeforeRestart } from '../agent-auth-restart-preservation'
import type { AgentAwakeService } from '../agent-awake-service'
import type { ClaudeRuntimeAuthService } from '../claude/accounts/runtime-auth-service'
import type { CodexRuntimeHomeService } from '../codex/accounts/runtime-home-service'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import { registerCoreHandlers } from '../ipc/register-core-handlers'
import type { KeybindingService } from '../keybindings/keybinding-service'
import type { Store } from '../persistence'
import type { RateLimitResumeService } from '../rate-limit-resume/service'
import type { RateLimitService } from '../rate-limits/service'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { StatsCollector } from '../stats/collector'
import { attachMainWindowServices } from './attach-main-window-services'
import type { RendererReloadLifecycle } from './renderer-reload-lifecycle'

export type MainWindowRuntimeServices = {
  store: Store
  runtime: YiruRuntimeService
  stats: StatsCollector
  rateLimits: RateLimitService
  agentAwakeService: AgentAwakeService | null
  crashReports: CrashReportStore | null
  keybindings: KeybindingService
  codexRuntimeHome: CodexRuntimeHomeService
  claudeRuntimeAuth: ClaudeRuntimeAuthService
  rateLimitResumes: RateLimitResumeService | null
}

export function attachMainWindowRuntimeServices(options: {
  window: BrowserWindow
  services: MainWindowRuntimeServices
  rendererReload: RendererReloadLifecycle
  prepareForCodexLaunch: Parameters<typeof attachMainWindowServices>[3]
  awaitLocalPtyStartup: () => Promise<void>
  setQuitting: () => void
  recordReload: (ignoreCache: boolean) => void
}): void {
  const { services, window } = options
  const rendererWebContentsId = window.webContents.id
  registerCoreHandlers(
    services.store,
    services.runtime,
    services.stats,
    services.rateLimits,
    rendererWebContentsId,
    services.agentAwakeService ?? undefined,
    services.crashReports ?? undefined,
    services.keybindings,
    {
      getAdditionalAiVaultCodexHomePaths: () =>
        services.codexRuntimeHome.getHostCodexHomePathsForSessionDiscovery(),
      resolveAiVaultClaudeProjectsDirs: (target) =>
        services.claudeRuntimeAuth.resolveSessionProjectRoots(target),
      onBeforeRelaunch: async () => {
        options.setQuitting()
        await preserveAgentAuthBeforeRestart({
          codexRuntimeHome: services.codexRuntimeHome,
          claudeRuntimeAuth: services.claudeRuntimeAuth,
          store: services.store
        })
      }
    }
  )
  services.rateLimitResumes?.start()
  attachMainWindowServices(
    window,
    services.store,
    services.runtime,
    options.prepareForCodexLaunch,
    (target) => services.claudeRuntimeAuth.prepareForClaudeLaunch(target),
    {
      awaitLocalPtyStartup: options.awaitLocalPtyStartup,
      onBeforeRendererReload: ({ ignoreCache, webContentsId }) => {
        if (rendererWebContentsId === webContentsId) {
          options.rendererReload.markExpected(webContentsId)
        }
        options.recordReload(ignoreCache)
      },
      isRecoveryReloadInFlight: options.rendererReload.isRecoveryInFlight,
      onBeforeUpdateQuit: () =>
        preserveAgentAuthBeforeRestart({
          codexRuntimeHome: services.codexRuntimeHome,
          claudeRuntimeAuth: services.claudeRuntimeAuth,
          store: services.store
        })
    }
  )
  services.rateLimits.attach(window)
  services.rateLimits.start({ fetchImmediately: false })
}
