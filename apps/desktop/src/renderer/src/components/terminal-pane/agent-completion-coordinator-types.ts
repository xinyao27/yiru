import type { ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'

import type { RuntimeTerminalProcessInspection } from '@/runtime/runtime-terminal-inspection'

import type { RecognizedAgentProcess } from '../../../../shared/agent-process-recognition'
import type { GlobalSettings } from '../../../../shared/types'

export type AgentCompletionStatusSnapshot = ParsedAgentStatusPayload & {
  stateStartedAt?: number
}

export type AgentCompletionDispatchMeta = {
  source: 'hook' | 'title' | 'process-exit'
  quietedHookDone: boolean
  terminalIdleConfirmed?: boolean
  agentStatus?: AgentCompletionStatusSnapshot
}

export type AgentAttentionDispatchMeta = {
  source: 'hook'
  agentStatus: AgentCompletionStatusSnapshot
}

export type AgentCompletionCoordinatorOptions = {
  paneKey: string
  getPtyId: () => string | null
  getSettings: () => Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  inspectProcess: (
    settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
    ptyId: string
  ) => Promise<RuntimeTerminalProcessInspection>
  dispatchCompletion: (title: string, meta?: AgentCompletionDispatchMeta) => void
  dispatchAttention?: (title: string, meta: AgentAttentionDispatchMeta) => void
  dispatchHookLifecycle?: (payload: AgentCompletionStatusSnapshot) => void
  shouldSuppressProcessReplacementCompletion?: (
    exited: RecognizedAgentProcess,
    replacement: RecognizedAgentProcess
  ) => boolean
  shouldSuppressConfirmedProcessExitCompletion?: (exited: RecognizedAgentProcess) => boolean
  isLive: () => boolean
  shouldPollProcessCadence?: () => boolean
  // Why: on hosts where one inspection forks a whole-process-table scan (local
  // Windows PowerShell/CIM), panes without agent evidence relax to a slow
  // cadence; cheap hosts (POSIX `ps`, SSH/remote-owned scans) keep full cadence.
  isProcessInspectionCostly?: () => boolean
  shouldSuppressHookCompletion?: (payload: AgentCompletionStatusSnapshot) => boolean
}

export type AgentCompletionCoordinator = {
  observeTitle: (title: string) => void
  observeClassifiedTitleCompletion: (title: string) => void
  observeTitleWorking: () => void
  observeOutputActivity: () => void
  observeHookStatus: (payload: AgentCompletionStatusSnapshot) => void
  startProcessTracking: () => void
  hasPendingHookDoneCompletion: () => boolean
  resetCompletionState: (options?: { requireFreshWorking?: boolean }) => void
  dispose: () => void
}
