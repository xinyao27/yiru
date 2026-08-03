import { toSshExecutionHostId } from '@yiru/workbench-model/workspace'
import { app } from 'electron'

import type { AgentAwakeService } from '../agent-awake-service'
import { registerAgentHookHandlers } from '../agent-hooks/agent-hooks'
import { registerAgentTrustHandlers } from '../agent-trust'
import { registerAiVaultHandlers } from '../ai-vault/ai-vault'
import {
  getSavedRuntimeAiVaultHostInfos,
  scanRuntimeAiVaultSessions
} from '../ai-vault/runtime-session-scanner'
import type { AiVaultSessionRuntimeTarget } from '../ai-vault/session/root-configuration'
import { registerAutomationHandlers } from '../automations/automations'
import type { AutomationService } from '../automations/service'
import {
  setTrustedBrowserRendererWebContentsId,
  setAgentBrowserBridgeRef
} from '../browser/browser'
import { registerBrowserHandlers } from '../browser/browser'
import { registerClaudeAccountHandlers } from '../claude/accounts/claude-accounts'
import type { ClaudeAccountService } from '../claude/accounts/service'
import { registerClaudeUsageHandlers } from '../claude/usage/claude-usage'
import type { ClaudeUsageStore } from '../claude/usage/store'
import { registerCliHandlers } from '../cli/cli'
import { registerCodexAccountHandlers } from '../codex/accounts/codex-accounts'
import type { CodexAccountService } from '../codex/accounts/service'
import { registerCodexUsageHandlers } from '../codex/usage/codex-usage'
import type { CodexUsageStore } from '../codex/usage/store'
import { registerComputerUsePermissionHandlers } from '../computer/computer-use-permissions'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import { registerCrashReportingHandlers } from '../crash-reporting/crash-reporting'
import { registerFeedbackHandlers } from '../crash-reporting/feedback'
import { registerDeveloperPermissionHandlers } from '../developer-permissions'
import { registerDiagnosticsHandlers } from '../diagnostics/diagnostics'
import { registerEmulatorFrameStreamHandlers } from '../emulator/frame-stream'
import { registerEmulatorVideoStreamHandlers } from '../emulator/video-stream'
import { registerExportHandlers } from '../export/export'
import { registerFilesystemHandlers } from '../filesystem/filesystem'
import { registerFilesystemWatcherHandlers } from '../filesystem/watcher'
import { registerGitHubHandlers } from '../github/github'
import { registerGitLabHandlers } from '../gitlab/gitlab'
import { registerGrokAccountHandlers } from '../grok/accounts/grok-accounts'
import type { KeybindingService } from '../keybindings/keybinding-service'
import { registerKeybindingHandlers } from '../keybindings/keybindings'
import { registerMemoryHandlers } from '../memory/memory'
import { registerMiniMaxCredentialsHandlers } from '../minimax/credentials'
import { registerNativeChatHandlers } from '../native-chat/native-chat'
import { registerNotebookHandlers } from '../notebook'
import { registerNotificationHandlers } from '../notifications/notifications'
import { registerOpenCodeUsageHandlers } from '../opencode/usage/opencode-usage'
import type { OpenCodeUsageStore } from '../opencode/usage/store'
import { registerOnboardingHandlers } from '../persisted-state/onboarding'
import { registerSessionHandlers } from '../persisted-state/session'
import type { Store } from '../persistence'
import { registerPetHandlers } from '../pet/pet'
import { registerLocalhostWorktreeLabelHandlers } from '../ports/localhost-worktree-labels'
import { registerWorkspacePortHandlers } from '../ports/workspace-ports'
import { registerPreflightHandlers } from '../preflight/preflight'
import { getPtyIdForPaneKey } from '../pty/pty'
import { registerRateLimitResumeHandlers } from '../rate-limit-resume/ipc'
import type { RateLimitResumeService } from '../rate-limit-resume/service'
import { registerRateLimitHandlers } from '../rate-limits/rate-limits'
import type { RateLimitService } from '../rate-limits/service'
import { registerRuntimeEnvironmentHandlers } from '../runtime/environments'
import { registerRuntimeHandlers } from '../runtime/runtime'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { registerSkillsHandlers } from '../skills/skills'
import { registerHostedReviewHandlers } from '../source-control/hosted-review-ipc'
import { registerSpeechHandlers } from '../speech/speech'
import type { StatsCollector } from '../stats/collector'
import { registerStatsHandlers } from '../stats/stats'
import { registerTelemetryHandlers } from '../telemetry/telemetry'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import { registerUpdaterHandlers } from '../window/attach-main-window-services'
import {
  registerClipboardHandlers,
  setTrustedClipboardRendererWebContentsId
} from '../window/clipboard-ipc-handlers'
import { registerUIHandlers, setTrustedUIRendererWebContentsId } from '../window/ui'
import { registerWorkspaceSpaceHandlers } from '../workspace-space'
import { registerYiruProfileHandlers } from '../yiru-profiles/yiru-profiles'
import { registerAppHandlers } from './app'
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
  commitMessageAgentEnv?: CommitMessageAgentEnvironmentResolvers,
  agentAwakeService?: AgentAwakeService,
  crashReports?: CrashReportStore,
  keybindings?: KeybindingService,
  lifecycleOptions: CoreHandlerLifecycleOptions = {},
  rateLimitResumes?: RateLimitResumeService
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
  registerStatsHandlers(stats, {
    claude: claudeUsage,
    codex: codexUsage,
    openCode: openCodeUsage
  })
  registerMemoryHandlers(store)
  registerNotificationHandlers(store, runtime)
  registerNotebookHandlers(store)
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
  if (rateLimitResumes) {
    registerRateLimitResumeHandlers(rateLimitResumes)
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
  registerAiVaultHandlers({
    getAdditionalCodexHomePaths: lifecycleOptions.getAdditionalAiVaultCodexHomePaths,
    resolveClaudeProjectsDirs: lifecycleOptions.resolveAiVaultClaudeProjectsDirs,
    getUnscannableAiVaultHostIds: () =>
      store.getSshTargets().map((target) => toSshExecutionHostId(target.id)),
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
