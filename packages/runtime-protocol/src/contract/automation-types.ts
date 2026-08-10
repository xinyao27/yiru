import type { TuiAgent } from '@yiru/workbench-model/agent'
import type { ExecutionHostId, SetupDecision } from '@yiru/workbench-model/workspace'

export type RuntimeProjectSourceIdentity =
  | { provider: 'github'; owner: string; repo: string }
  | {
      provider: 'gitlab'
      projectId?: string | null
      namespace?: string | null
      project?: string | null
      webUrl?: string | null
    }

export type RuntimeProjectSourceContext = {
  kind: 'project-source'
  provider: 'github' | 'gitlab'
  projectId: string
  hostId: ExecutionHostId
  projectHostSetupId?: string | null
  repoId?: string | null
  providerIdentity?: RuntimeProjectSourceIdentity | null
  accountLabel?: string | null
}

export type RuntimeWorkspaceRunContext = {
  kind: 'workspace-run'
  projectId: string
  hostId: ExecutionHostId
  projectHostSetupId: string
  repoId: string
  path: string
}

export type RuntimeAutomationPrecheck = {
  command: string
  timeoutSeconds: number
}

export type RuntimeAutomation = {
  id: string
  name: string
  prompt: string
  precheck: RuntimeAutomationPrecheck | null
  agentId: TuiAgent
  runContext?: RuntimeWorkspaceRunContext | null
  sourceContext?: RuntimeProjectSourceContext | null
  projectId: string
  executionTargetType: 'local'
  executionTargetId: string
  schedulerOwner: 'local_host_service' | 'remote_host_service'
  workspaceMode: 'existing' | 'new_per_run'
  workspaceId: string | null
  baseBranch: string | null
  setupDecision?: SetupDecision
  reuseSession: boolean
  timezone: string
  rrule: string
  dtstart: number
  enabled: boolean
  nextRunAt: number
  lastRunAt?: number
  missedRunPolicy: 'run_once_within_grace'
  missedRunGraceMinutes: number
  createdAt: number
  updatedAt: number
}

export type RuntimeAutomationRunStatus =
  | 'pending'
  | 'dispatching'
  | 'dispatched'
  | 'completed'
  | 'skipped_precheck'
  | 'skipped_missed'
  | 'skipped_unavailable'
  | 'skipped_needs_interactive_auth'
  | 'dispatch_failed'

export type RuntimeAutomationRunUsage = {
  status: 'known' | 'unavailable'
  provider: 'claude' | 'codex' | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  reasoningOutputTokens: number | null
  totalTokens: number | null
  estimatedCostUsd: number | null
  estimatedCostSource: 'api_equivalent' | null
  providerSessionId: string | null
  attribution: 'provider_session_time_window' | null
  collectedAt: number
  unavailableReason:
    | 'run_not_finished'
    | 'provider_unsupported'
    | 'usage_not_enabled'
    | 'scan_failed'
    | 'no_matching_session'
    | 'ambiguous_session'
    | null
  unavailableMessage: string | null
}

export type RuntimeAutomationRunOutputSnapshot = {
  format: 'plain_text'
  content: string
  capturedAt: number
  truncated: boolean
}

export type RuntimeAutomationPrecheckResult = {
  command: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  error: string | null
  startedAt: number
  completedAt: number
}

export type RuntimeAutomationRun = {
  id: string
  automationId: string
  runContext?: RuntimeWorkspaceRunContext | null
  sourceContext?: RuntimeProjectSourceContext | null
  title: string
  scheduledFor: number
  status: RuntimeAutomationRunStatus
  trigger: 'scheduled' | 'manual'
  workspaceId: string | null
  workspaceDisplayName?: string | null
  sessionKind: 'terminal'
  chatSessionId: string | null
  terminalSessionId: string | null
  terminalPaneKey: string | null
  terminalPtyId: string | null
  outputSnapshot: RuntimeAutomationRunOutputSnapshot | null
  precheckResult: RuntimeAutomationPrecheckResult | null
  usage: RuntimeAutomationRunUsage | null
  error: string | null
  startedAt: number | null
  dispatchedAt: number | null
  createdAt: number
  runNumber?: number
}

export type RuntimeAutomationListResult = { automations: RuntimeAutomation[] }
export type RuntimeAutomationResult = { automation: RuntimeAutomation }
export type RuntimeAutomationDeleteResult = { removed: boolean; id: string }
export type RuntimeAutomationRunResult = { run: RuntimeAutomationRun }
export type RuntimeAutomationRunsResult = { runs: RuntimeAutomationRun[] }
