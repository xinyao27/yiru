import type {
  AgentProviderSessionMetadata,
  SleepingAgentLaunchConfig
} from '@yiru/workbench-model/agent'
import type { SessionOptionValue } from '~shared/agent/session-options'
import type { StartupCommandDelivery } from '~shared/codex-startup-delivery'
import type {
  GlobalSettings,
  SetupSplitDirection,
  TuiAgent,
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch
} from '~shared/types'

import type { PendingSidebarWorktreeReveal } from '../store/slices/ui'
import type { AgentStartedTelemetry } from './agent-started-telemetry'
import type { WorktreeRuntimeOwnerState } from './worktree-runtime-owner'

export type WorktreeStartupPayload = {
  command: string
  env?: Record<string, string>
  launchConfig?: SleepingAgentLaunchConfig
  resumeProviderSession?: AgentProviderSessionMetadata
  launchToken?: string
  launchAgent?: TuiAgent
  draftPrompt?: string
  startupCommandDelivery?: StartupCommandDelivery
  initialAgentStatus?: { agent: TuiAgent; prompt: string }
  sessionOptions?: Record<string, SessionOptionValue>
  telemetry?: AgentStartedTelemetry
}

export type ActivateAndRevealResult = { primaryTabId: string | null }

export type ActivateWorktreeOptions = {
  startup?: WorktreeStartupPayload
  initialCwd?: string
  setup?: WorktreeSetupLaunch
  defaultTabs?: WorktreeDefaultTabsLaunch
  sidebarRevealBehavior?: PendingSidebarWorktreeReveal['behavior']
  notifyHostRuntime?: boolean
  revealInSidebar?: boolean
}

export type WorktreeActivationStore = Partial<WorktreeRuntimeOwnerState> & {
  tabsByWorktree: Record<string, { id: string }[]>
  defaultTerminalTabsAppliedByWorktreeId: Record<string, true>
  createTab: (
    worktreeId: string,
    targetGroupId?: string,
    shellOverride?: string,
    options?: {
      pendingActivationSpawn?: boolean
      launchAgent?: TuiAgent
      recordInteraction?: boolean
      activate?: boolean
    }
  ) => { id: string }
  setActiveTab: (tabId: string) => void
  setTabCustomTitle: (
    tabId: string,
    title: string | null,
    options?: { recordInteraction?: boolean }
  ) => void
  setTabColor: (tabId: string, color: string | null) => void
  markDefaultTerminalTabsApplied: (worktreeId: string) => void
  reconcileWorktreeTabModel: (worktreeId: string) => { renderableTabCount: number }
  queueTabStartupCommand: (
    tabId: string,
    startup: {
      command: string
      env?: Record<string, string>
      launchConfig?: SleepingAgentLaunchConfig
      resumeProviderSession?: AgentProviderSessionMetadata
      launchToken?: string
      launchAgent?: TuiAgent
      draftPrompt?: string
      initialAgentStatus?: { agent: TuiAgent; prompt: string }
      showSessionRestoredBanner?: boolean
      telemetry?: AgentStartedTelemetry
    }
  ) => void
  queueTabSetupSplit: (
    tabId: string,
    startup: { command: string; env?: Record<string, string>; direction: SetupSplitDirection }
  ) => void
  queueTabInitialCwd: (tabId: string, cwd: string) => void
  settings?: GlobalSettings | null
}
