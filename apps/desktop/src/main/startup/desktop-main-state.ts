import type { AgentAwakeService } from '../agent-awake-service'
import type { ClaudeRuntimeAuthService } from '../claude/accounts/runtime-auth-service'
import type { CodexRuntimeHomeService } from '../codex/accounts/runtime-home-service'
import type { CoworkingOwnerComposition } from '../coworking/owner/composition'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import type { KeybindingService } from '../keybindings/keybinding-service'
import type { Store } from '../persistence'
import type { RateLimitResumeService } from '../rate-limit-resume/service'
import type { RateLimitService } from '../rate-limits/service'
import type { YiruRuntimeRpcServer } from '../runtime/rpc'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { StarNagService } from '../star-nag/service'
import type { StatsCollector } from '../stats/collector'
import type { MainWindowRuntimeServices } from '../window/main-window-runtime-services'

export class DesktopMainState {
  isQuitting = false
  store: Store | null = null
  stats: StatsCollector | null = null
  codexRuntimeHome: CodexRuntimeHomeService | null = null
  claudeRuntimeAuth: ClaudeRuntimeAuthService | null = null
  runtime: YiruRuntimeService | null = null
  rateLimits: RateLimitService | null = null
  runtimeRpc: YiruRuntimeRpcServer | null = null
  coworkingOwner: CoworkingOwnerComposition | null = null
  unregisterCoworkingSharingController: (() => void) | null = null
  headlessBrowserDisplayAvailable = false
  starNag: StarNagService | null = null
  agentAwakeService: AgentAwakeService | null = null
  crashReports: CrashReportStore | null = null
  unsubscribeAgentAwakeStatusChanges: (() => void) | null = null
  unsubscribeSystemResumeBroadcast: (() => void) | null = null
  unsubscribeWindowFocusBroadcast: (() => void) | null = null
  rateLimitResumes: RateLimitResumeService | null = null
  keybindings: KeybindingService | null = null
  firstWindowStartupServicesReady: Promise<void> = Promise.resolve()
  localPtyStartupReady: Promise<void> = Promise.resolve()

  getMainWindowServices(): MainWindowRuntimeServices | null {
    if (
      !this.store ||
      !this.runtime ||
      !this.stats ||
      !this.rateLimits ||
      !this.keybindings ||
      !this.codexRuntimeHome ||
      !this.claudeRuntimeAuth
    ) {
      return null
    }
    return {
      store: this.store,
      runtime: this.runtime,
      stats: this.stats,
      rateLimits: this.rateLimits,
      agentAwakeService: this.agentAwakeService,
      crashReports: this.crashReports,
      keybindings: this.keybindings,
      codexRuntimeHome: this.codexRuntimeHome,
      claudeRuntimeAuth: this.claudeRuntimeAuth,
      rateLimitResumes: this.rateLimitResumes
    }
  }
}
