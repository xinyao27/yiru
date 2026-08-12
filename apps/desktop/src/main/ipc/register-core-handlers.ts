import { app, BrowserWindow, dialog, shell } from 'electron'

import type { AgentAwakeService } from '../agent-awake-service'
import { registerAgentTrustHandlers } from '../agent-trust'
import {
  getSavedRuntimeAiVaultHostInfos,
  scanRuntimeAiVaultSessions
} from '../ai-vault/runtime-session-scanner'
import type { AiVaultSessionRuntimeTarget } from '../ai-vault/session/root-configuration'
import type { AutomationService } from '../automations/service'
import { initializeShellAutomationService } from '../automations/shell-service'
import { setTrustedBrowserRendererWebContentsId } from '../browser/browser'
import { setAgentBrowserBridgeRef } from '../browser/page/control'
import { registerClaudeUsageHandlers } from '../claude/usage/claude-usage'
import type { ClaudeUsageStore } from '../claude/usage/store'
import { registerCodexUsageHandlers } from '../codex/usage/codex-usage'
import type { CodexUsageStore } from '../codex/usage/store'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import { initializeShellCrashReportingService } from '../crash-reporting/crash-reporting'
import { registerEmulatorFrameStreamHandlers } from '../emulator/frame-stream'
import { registerEmulatorVideoStreamHandlers } from '../emulator/video-stream'
import type { KeybindingService } from '../keybindings/keybinding-service'
import { initializeShellKeybindingsService } from '../keybindings/keybindings'
import { initializeShellMiniMaxCredentialsService } from '../minimax/credentials'
import { initializeNotebookAuthorizedStore } from '../notebook'
import { initializeShellNotificationsService } from '../notifications/notifications'
import { registerOpenCodeUsageHandlers } from '../opencode/usage/opencode-usage'
import type { OpenCodeUsageStore } from '../opencode/usage/store'
import { initializeShellOnboardingService } from '../persisted-state/onboarding'
import { initializeShellSessionService } from '../persisted-state/session'
import type { Store } from '../persistence'
import { initializeShellLocalhostWorktreeLabelService } from '../ports/localhost-worktree-labels'
import { registerWorkspacePortHandlers } from '../ports/workspace-ports'
import type { RateLimitService } from '../rate-limits/service'
import { initializeRuntimeEnvironmentRegistry } from '../runtime/environments'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { initializeShellAppService } from '../shell/app'
import { initializeShellClipboardService } from '../shell/clipboard'
import { initializeShellFilesService } from '../shell/files'
import { initializeShellGitHubWindowService } from '../shell/github'
import { initializeShellPlatformService } from '../shell/platform'
import { initializeShellRuntimeStateService } from '../shell/runtime-state'
import { initializeShellSettingsService } from '../shell/settings'
import type { StatsCollector } from '../stats/collector'
import { initializeShellTelemetryService } from '../telemetry/telemetry'
import { registerUIHandlers } from '../window/ui'
import { initializeShellYiruProfilesService } from '../yiru-profiles/yiru-profiles'
import { registerAiVaultHandlers } from './ai-vault'

let registered = false

type CoreHandlerLifecycleOptions = {
  onBeforeRelaunch?: () => void | Promise<void>
  getAdditionalAiVaultCodexHomePaths?: () => readonly string[]
  resolveAiVaultClaudeProjectsDirs?: (
    target: AiVaultSessionRuntimeTarget
  ) => Promise<readonly string[]>
}

export function registerCoreHandlers(
  store: Store,
  runtime: YiruRuntimeService,
  stats: StatsCollector,
  claudeUsage: ClaudeUsageStore,
  codexUsage: CodexUsageStore,
  openCodeUsage: OpenCodeUsageStore,
  rateLimits: RateLimitService,
  mainWindowWebContentsId: number | null = null,
  automations?: AutomationService,
  agentAwakeService?: AgentAwakeService,
  crashReports?: CrashReportStore,
  keybindings?: KeybindingService,
  lifecycleOptions: CoreHandlerLifecycleOptions = {}
): void {
  // Why: on macOS the app can stay alive after all windows close, then
  // openMainWindow() is called again on 'activate'. ipcMain.handle() throws
  // if a channel is registered twice, so we guard to register only once and
  // just update the per-window web-contents ID on subsequent calls.
  setTrustedBrowserRendererWebContentsId(mainWindowWebContentsId)
  setAgentBrowserBridgeRef(runtime.getAgentBrowserBridge())
  if (registered) {
    return
  }
  registered = true

  initializeShellAppService(store, { onBeforeRelaunch: lifecycleOptions.onBeforeRelaunch })
  registerClaudeUsageHandlers(claudeUsage)
  registerCodexUsageHandlers(codexUsage)
  registerOpenCodeUsageHandlers(openCodeUsage)
  registerAgentTrustHandlers()
  initializeShellMiniMaxCredentialsService(rateLimits)
  initializeShellGitHubWindowService(store, stats)
  if (crashReports) {
    initializeShellCrashReportingService(crashReports)
  }
  initializeShellNotificationsService(store)
  // Why: no more `notebook:*` IPC channels to register — this just hands the
  // store reference the `notebook.runPythonCell` oRPC contract needs.
  initializeNotebookAuthorizedStore(store)
  initializeShellOnboardingService(store)
  // Why: diagnostics handlers are wired alongside telemetry but the two
  // lanes never share a code path — `ipc/diagnostics.ts` imports only from
  // `src/main/observability/`, never from `src/main/telemetry/`. Order is
  // not load-bearing; both register independent ipcMain channels.
  initializeShellSettingsService(store, agentAwakeService)
  if (automations) {
    initializeShellAutomationService(automations)
  }
  if (keybindings) {
    initializeShellKeybindingsService(keybindings)
  }
  initializeShellTelemetryService(store)
  initializeShellYiruProfilesService(store, {
    onBeforeRelaunch: lifecycleOptions.onBeforeRelaunch
  })
  initializeShellPlatformService()
  initializeShellSessionService(store)
  registerUIHandlers(store)
  registerEmulatorFrameStreamHandlers()
  registerEmulatorVideoStreamHandlers()
  registerWorkspacePortHandlers(store)
  initializeShellLocalhostWorktreeLabelService(store)
  initializeShellFilesService(store, {
    chooseDownloadDirectory: async (rendererId) => {
      const parentWindow = findRendererWindow(rendererId)
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, {
            properties: ['openDirectory', 'createDirectory']
          })
        : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    chooseDownloadFile: async (rendererId, suggestedName) => {
      const parentWindow = findRendererWindow(rendererId)
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, { defaultPath: suggestedName })
        : await dialog.showSaveDialog({ defaultPath: suggestedName })
      return result.canceled ? null : (result.filePath ?? null)
    },
    trashPath: (targetPath) => shell.trashItem(targetPath)
  })
  initializeShellRuntimeStateService(runtime)
  initializeRuntimeEnvironmentRegistry(store)
  registerAiVaultHandlers({
    getAdditionalCodexHomePaths: lifecycleOptions.getAdditionalAiVaultCodexHomePaths,
    resolveClaudeProjectsDirs: lifecycleOptions.resolveAiVaultClaudeProjectsDirs,
    getActiveRuntimeAiVaultHostInfos: () =>
      getSavedRuntimeAiVaultHostInfos(app.getPath('userData')),
    scanRuntimeAiVaultSessions: async (environmentId, args, options) =>
      scanRuntimeAiVaultSessions(app.getPath('userData'), environmentId, args, options)
  })
  initializeShellClipboardService(store)
}

function findRendererWindow(rendererId: number): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find(
      (window) => !window.isDestroyed() && window.webContents.id === rendererId
    ) ?? null
  )
}
