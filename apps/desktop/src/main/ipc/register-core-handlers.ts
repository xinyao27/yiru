import { app, BrowserWindow, dialog, shell } from 'electron'

import type { AgentAwakeService } from '../agent-awake-service'
import { registerAgentTrustHandlers } from '../agent-trust'
import {
  getSavedRuntimeAiVaultHostInfos,
  scanRuntimeAiVaultSessions
} from '../ai-vault/runtime-session-scanner'
import type { AiVaultSessionRuntimeTarget } from '../ai-vault/session/root-configuration'
import type { AutomationService } from '../automations/service'
import { setTrustedBrowserRendererWebContentsId } from '../browser/browser'
import { registerBrowserHandlers } from '../browser/browser'
import { setAgentBrowserBridgeRef } from '../browser/page/control'
import { registerClaudeAccountHandlers } from '../claude/accounts/claude-accounts'
import type { ClaudeAccountService } from '../claude/accounts/service'
import { registerClaudeUsageHandlers } from '../claude/usage/claude-usage'
import type { ClaudeUsageStore } from '../claude/usage/store'
import { registerCodexAccountHandlers } from '../codex/accounts/codex-accounts'
import type { CodexAccountService } from '../codex/accounts/service'
import { registerCodexUsageHandlers } from '../codex/usage/codex-usage'
import type { CodexUsageStore } from '../codex/usage/store'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import { registerCrashReportingHandlers } from '../crash-reporting/crash-reporting'
import { registerFeedbackHandlers } from '../crash-reporting/feedback'
import { registerDeveloperPermissionHandlers } from '../developer-permissions'
import { registerDiagnosticsHandlers } from '../diagnostics/diagnostics'
import { registerEmulatorFrameStreamHandlers } from '../emulator/frame-stream'
import { registerEmulatorVideoStreamHandlers } from '../emulator/video-stream'
import { registerExportHandlers } from '../export/export'
import { registerFilesystemHandlers } from '../filesystem/filesystem'
import type { KeybindingService } from '../keybindings/keybinding-service'
import { registerKeybindingHandlers } from '../keybindings/keybindings'
import { registerMiniMaxCredentialsHandlers } from '../minimax/credentials'
import { initializeNotebookAuthorizedStore } from '../notebook'
import { registerNotificationHandlers } from '../notifications/notifications'
import { registerOpenCodeUsageHandlers } from '../opencode/usage/opencode-usage'
import type { OpenCodeUsageStore } from '../opencode/usage/store'
import { registerOnboardingHandlers } from '../persisted-state/onboarding'
import { registerSessionHandlers } from '../persisted-state/session'
import type { Store } from '../persistence'
import { registerPetHandlers } from '../pet/pet'
import { registerLocalhostWorktreeLabelHandlers } from '../ports/localhost-worktree-labels'
import { registerWorkspacePortHandlers } from '../ports/workspace-ports'
import type { RateLimitService } from '../rate-limits/service'
import { registerRuntimeEnvironmentHandlers } from '../runtime/environments'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { registerSpeechHandlers } from '../speech/speech'
import type { StatsCollector } from '../stats/collector'
import { registerTelemetryHandlers } from '../telemetry/telemetry'
import { registerUpdaterHandlers } from '../window/attach-main-window-services'
import {
  registerClipboardHandlers,
  setTrustedClipboardRendererWebContentsId
} from '../window/clipboard-ipc-handlers'
import { registerUIHandlers, setTrustedUIRendererWebContentsId } from '../window/ui'
import { registerYiruProfileHandlers } from '../yiru-profiles/yiru-profiles'
import { registerAiVaultHandlers } from './ai-vault'
import { registerAppHandlers } from './app'
import { registerAutomationHandlers } from './automations'
import { electronIpcRegistration } from './electron-ipc-registration'
import { registerGitHubIpcHandlers } from './github'
import { registerRuntimeHandlers } from './runtime'
import { registerSettingsHandlers } from './settings'
import { registerShellHandlers } from './shell'

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
  codexAccounts: CodexAccountService,
  claudeAccounts: ClaudeAccountService,
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
  setTrustedClipboardRendererWebContentsId(mainWindowWebContentsId)
  setTrustedUIRendererWebContentsId(mainWindowWebContentsId)
  setAgentBrowserBridgeRef(runtime.getAgentBrowserBridge())
  if (registered) {
    return
  }
  registered = true

  registerAppHandlers(store, { onBeforeRelaunch: lifecycleOptions.onBeforeRelaunch })
  registerClaudeUsageHandlers(claudeUsage)
  registerCodexUsageHandlers(codexUsage)
  registerOpenCodeUsageHandlers(openCodeUsage)
  registerCodexAccountHandlers(codexAccounts)
  registerAgentTrustHandlers()
  registerClaudeAccountHandlers(claudeAccounts)
  registerMiniMaxCredentialsHandlers(rateLimits)
  registerGitHubIpcHandlers(store, stats)
  registerFeedbackHandlers()
  if (crashReports) {
    registerCrashReportingHandlers(crashReports)
  }
  registerExportHandlers()
  registerNotificationHandlers(store)
  // Why: no more `notebook:*` IPC channels to register — this just hands the
  // store reference the `notebook.runPythonCell` oRPC contract needs.
  initializeNotebookAuthorizedStore(store)
  registerOnboardingHandlers(store)
  registerDeveloperPermissionHandlers()
  // Why: diagnostics handlers are wired alongside telemetry but the two
  // lanes never share a code path — `ipc/diagnostics.ts` imports only from
  // `src/main/observability/`, never from `src/main/telemetry/`. Order is
  // not load-bearing; both register independent ipcMain channels.
  registerDiagnosticsHandlers()
  registerSettingsHandlers(store, agentAwakeService)
  if (automations) {
    registerAutomationHandlers(automations)
  }
  if (keybindings) {
    registerKeybindingHandlers(keybindings)
  }
  registerTelemetryHandlers(store)
  registerYiruProfileHandlers(store, { onBeforeRelaunch: lifecycleOptions.onBeforeRelaunch })
  registerBrowserHandlers()
  registerShellHandlers()
  registerPetHandlers()
  registerSessionHandlers(store)
  registerUIHandlers(store)
  registerEmulatorFrameStreamHandlers()
  registerEmulatorVideoStreamHandlers()
  registerWorkspacePortHandlers(store)
  registerLocalhostWorktreeLabelHandlers(store)
  registerFilesystemHandlers(electronIpcRegistration, store, {
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
  registerRuntimeHandlers(runtime)
  registerRuntimeEnvironmentHandlers(store)
  registerAiVaultHandlers({
    getAdditionalCodexHomePaths: lifecycleOptions.getAdditionalAiVaultCodexHomePaths,
    resolveClaudeProjectsDirs: lifecycleOptions.resolveAiVaultClaudeProjectsDirs,
    getActiveRuntimeAiVaultHostInfos: () =>
      getSavedRuntimeAiVaultHostInfos(app.getPath('userData')),
    scanRuntimeAiVaultSessions: async (environmentId, args, options) =>
      scanRuntimeAiVaultSessions(app.getPath('userData'), environmentId, args, options)
  })
  registerClipboardHandlers(store)
  registerUpdaterHandlers(store)
  registerSpeechHandlers()
}

function findRendererWindow(rendererId: number): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find(
      (window) => !window.isDestroyed() && window.webContents.id === rendererId
    ) ?? null
  )
}
