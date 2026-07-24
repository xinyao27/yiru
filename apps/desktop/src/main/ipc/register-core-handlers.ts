import { app } from 'electron'

import type { AgentAwakeService } from '../agent-awake-service'
import {
  getSavedRuntimeAiVaultHostInfos,
  scanRuntimeAiVaultSessions
} from '../ai-vault/runtime-session-scanner'
import type { AiVaultSessionRuntimeTarget } from '../ai-vault/session-root-configuration'
import type { AutomationService } from '../automations/service'
import type { ClaudeAccountService } from '../claude-accounts/service'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexAccountService } from '../codex-accounts/service'
import type { CodexUsageStore } from '../codex-usage/store'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import type { KeybindingService } from '../keybindings/keybinding-service'
import type { OpenCodeUsageStore } from '../opencode-usage/store'
import type { Store } from '../persistence'
import type { RateLimitService } from '../rate-limits/service'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { StatsCollector } from '../stats/collector'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import { registerUpdaterHandlers } from '../window/attach-main-window-services'
import {
  registerClipboardHandlers,
  setTrustedClipboardRendererWebContentsId
} from '../window/clipboard-ipc-handlers'
import { registerAgentHookHandlers } from './agent-hooks'
import { registerAgentTrustHandlers } from './agent-trust'
import { registerAiVaultHandlers } from './ai-vault'
import { registerAppHandlers } from './app'
import { registerAutomationHandlers } from './automations'
import { setTrustedBrowserRendererWebContentsId, setAgentBrowserBridgeRef } from './browser'
import { registerBrowserHandlers } from './browser'
import { registerClaudeAccountHandlers } from './claude-accounts'
import { registerClaudeUsageHandlers } from './claude-usage'
import { registerCliHandlers } from './cli'
import { registerCodexAccountHandlers } from './codex-accounts'
import { registerCodexUsageHandlers } from './codex-usage'
import { registerComputerUsePermissionHandlers } from './computer-use-permissions'
import { registerCrashReportingHandlers } from './crash-reporting'
import { registerDeveloperPermissionHandlers } from './developer-permissions'
import { registerDiagnosticsHandlers } from './diagnostics'
import { registerEmulatorFrameStreamHandlers } from './emulator-frame-stream'
import { registerEmulatorVideoStreamHandlers } from './emulator-video-stream'
import { registerEphemeralVmHandlers } from './ephemeral-vm'
import { registerExportHandlers } from './export'
import { registerFeedbackHandlers } from './feedback'
import { registerFilesystemHandlers } from './filesystem'
import { registerFilesystemWatcherHandlers } from './filesystem-watcher'
import { registerGitHubHandlers } from './github'
import { registerGitLabHandlers } from './gitlab'
import { registerGrokAccountHandlers } from './grok-accounts'
import { registerHostedReviewHandlers } from './hosted-review'
import { registerKeybindingHandlers } from './keybindings'
import { registerLanguageServerHandlers } from './language-servers'
import { registerLocalhostWorktreeLabelHandlers } from './localhost-worktree-labels'
import { registerMemoryHandlers } from './memory'
import { registerMiniMaxCredentialsHandlers } from './minimax-credentials'
import { registerNativeChatHandlers } from './native-chat'
import { registerNotebookHandlers } from './notebook'
import { registerNotificationHandlers } from './notifications'
import { registerOnboardingHandlers } from './onboarding'
import { registerOpenCodeUsageHandlers } from './opencode-usage'
import { registerPetHandlers } from './pet'
import { registerPreflightHandlers } from './preflight'
import { getPtyIdForPaneKey } from './pty'
import { registerRateLimitHandlers } from './rate-limits'
import { registerRuntimeHandlers } from './runtime'
import { registerRuntimeEnvironmentHandlers } from './runtime-environments'
import { registerSessionHandlers } from './session'
import { registerSettingsHandlers } from './settings'
import { registerShellHandlers } from './shell'
import { registerSkillsHandlers } from './skills'
import { registerSpeechHandlers } from './speech'
import { registerStatsHandlers } from './stats'
import { registerTelemetryHandlers } from './telemetry'
import { registerUIHandlers, setTrustedUIRendererWebContentsId } from './ui'
import { registerWorkspacePortHandlers } from './workspace-ports'
import { registerWorkspaceSpaceHandlers } from './workspace-space'
import { registerYiruProfileHandlers } from './yiru-profiles'

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
  commitMessageAgentEnv?: CommitMessageAgentEnvironmentResolvers,
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
  registerCliHandlers()
  registerPreflightHandlers()
  registerClaudeUsageHandlers(claudeUsage)
  registerCodexUsageHandlers(codexUsage)
  registerOpenCodeUsageHandlers(openCodeUsage)
  registerCodexAccountHandlers(codexAccounts)
  registerAgentHookHandlers(runtime, { getPtyIdForPaneKey })
  registerAgentTrustHandlers()
  registerClaudeAccountHandlers(claudeAccounts)
  registerMiniMaxCredentialsHandlers(rateLimits)
  registerGrokAccountHandlers()
  registerRateLimitHandlers(rateLimits)
  registerGitHubHandlers(store, stats)
  registerGitLabHandlers(store)
  registerHostedReviewHandlers(store, stats)
  registerFeedbackHandlers()
  if (crashReports) {
    registerCrashReportingHandlers(crashReports)
  }
  registerExportHandlers()
  registerStatsHandlers(stats)
  registerMemoryHandlers(store)
  registerNotificationHandlers(store, runtime)
  registerNotebookHandlers(store)
  registerLanguageServerHandlers(store)
  registerOnboardingHandlers(store)
  registerDeveloperPermissionHandlers()
  // Why: diagnostics handlers are wired alongside telemetry but the two
  // lanes never share a code path — `ipc/diagnostics.ts` imports only from
  // `src/main/observability/`, never from `src/main/telemetry/`. Order is
  // not load-bearing; both register independent ipcMain channels.
  registerDiagnosticsHandlers()
  registerComputerUsePermissionHandlers()
  registerSettingsHandlers(store, agentAwakeService)
  registerSkillsHandlers(store)
  if (automations) {
    registerAutomationHandlers(store, automations)
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
  registerWorkspaceSpaceHandlers(store)
  registerWorkspacePortHandlers(store)
  registerLocalhostWorktreeLabelHandlers(store)
  if (commitMessageAgentEnv) {
    registerFilesystemHandlers(store, commitMessageAgentEnv)
  } else {
    registerFilesystemHandlers(store)
  }
  registerFilesystemWatcherHandlers()
  registerRuntimeHandlers(runtime)
  registerRuntimeEnvironmentHandlers(store)
  registerEphemeralVmHandlers(store)
  registerAiVaultHandlers({
    getAdditionalCodexHomePaths: lifecycleOptions.getAdditionalAiVaultCodexHomePaths,
    resolveClaudeProjectsDirs: lifecycleOptions.resolveAiVaultClaudeProjectsDirs,
    getActiveRuntimeAiVaultHostInfos: () =>
      getSavedRuntimeAiVaultHostInfos(app.getPath('userData')),
    scanRuntimeAiVaultSessions: async (environmentId, args, options) =>
      scanRuntimeAiVaultSessions(app.getPath('userData'), environmentId, args, options)
  })
  registerNativeChatHandlers()
  registerClipboardHandlers(store)
  registerUpdaterHandlers(store)
  registerSpeechHandlers(store)
}
