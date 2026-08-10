import type { AgentType, NativeChatMessage } from '@yiru/workbench-model/agent'

import type { RuntimeJsonValue } from './json-value.js'
import type { TerminalRead, TerminalState } from './terminal-results.js'

export const ORCHESTRATION_MESSAGE_TYPES = [
  'status',
  'dispatch',
  'worker_done',
  'merge_ready',
  'escalation',
  'handoff',
  'decision_gate',
  'question',
  'heartbeat'
] as const

export type OrchestrationMessageType = (typeof ORCHESTRATION_MESSAGE_TYPES)[number]
export type OrchestrationMessagePriority = 'normal' | 'high' | 'urgent'
export type OrchestrationTaskStatus =
  | 'pending'
  | 'ready'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'blocked'
export type OrchestrationDispatchStatus =
  | 'pending'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'circuit_broken'
export type OrchestrationGateStatus = 'pending' | 'resolved' | 'timeout'

export type OrchestrationRun = {
  id: string
  objective: string
  home_database: string
  coordinator_handle: string | null
  coordinator_pane_key: string | null
  consumer_generation: number
  legacy: number
  created_at: string
  updated_at: string
}

export type OrchestrationMessage = {
  id: string
  run_id: string
  from_handle: string
  to_handle: string
  subject: string
  body: string
  type: OrchestrationMessageType
  priority: OrchestrationMessagePriority
  thread_id: string | null
  payload: string | null
  read: number
  sequence: number
  created_at: string
  delivered_at: string | null
  sender_pane_key: string | null
}

export type OrchestrationQuestion = {
  message_id: string
  run_id: string
  dispatch_id: string
  asker_handle: string
  status: 'pending' | 'answered' | 'closed'
  answer_message_id: string | null
  answer_body: string | null
  answered_by_generation: number | null
  created_at: string
  answered_at: string | null
  closed_at: string | null
}

export type OrchestrationTask = {
  id: string
  run_id: string
  parent_id: string | null
  created_by_terminal_handle: string | null
  task_title: string | null
  display_name: string | null
  spec: string
  status: OrchestrationTaskStatus
  deps: string
  result: string | null
  created_at: string
  completed_at: string | null
}

export type OrchestrationTaskListItem = OrchestrationTask & {
  assignee_handle?: string | null
  dispatch_id?: string | null
  spec_truncated?: boolean
}

export type OrchestrationDispatch = {
  id: string
  run_id: string
  task_id: string
  assignee_handle: string | null
  assignee_pane_key: string | null
  capability_hash: string | null
  process_incarnation: string | null
  capability_revoked_at: string | null
  status: OrchestrationDispatchStatus
  failure_count: number
  last_failure: string | null
  dispatched_at: string | null
  completed_at: string | null
  created_at: string
  last_heartbeat_at: string | null
}

export type OrchestrationGate = {
  id: string
  run_id: string
  task_id: string
  question: string
  options: string
  status: OrchestrationGateStatus
  resolution: string | null
  created_at: string
  resolved_at: string | null
}

export type OrchestrationWorkerState =
  | 'starting'
  | 'ready'
  | 'start_unknown'
  | 'failed'
  | 'succeeded'
  | 'stopping'
  | 'stop_unknown'
  | 'stopped'
  | 'abandoned'

export type OrchestrationWorker = {
  dispatch_id: string
  runtime_epoch: string | null
  state: OrchestrationWorkerState
  stage: string
  worktree_id: string | null
  agent_terminal_handle: string | null
  setup_state: string
  effects: RuntimeJsonValue[]
  residual_resources: string
  start_options: string
  last_error: string | null
  created_at: string
  updated_at: string
  residualResources: RuntimeJsonValue[]
  startOptions: RuntimeJsonValue
}

export type OrchestrationRemoteAttachment = {
  dispatch_id: string
  task_id: string
  home_peer_fingerprint: string
  protocol_version: number
  runtime_epoch: string
  capability_hash: string | null
  pane_key: string | null
  process_incarnation: string | null
  state: OrchestrationWorkerState
  stage: string
  worktree_id: string | null
  terminal_handle: string | null
  setup_state: string
  effects: RuntimeJsonValue[]
  residual_resources: string
  to_worker_imported_sequence: number
  last_error: string | null
  created_at: string
  updated_at: string
  residualResources: RuntimeJsonValue[]
}

export type OrchestrationFederationRelayItem = {
  dispatch_id: string
  direction: 'to_home' | 'to_worker'
  sequence: number
  message_id: string
  kind: string
  payload: string
  byte_count: number
  acked_at: string | null
  created_at: string
}

export type OrchestrationWorkerSetupReceipt = {
  requested: 'run' | 'skip' | 'inherit' | 'not_applicable'
  effective: 'run' | 'skip' | 'inherit' | 'not_applicable'
  source: string
  hookFound: boolean
  startupPolicy: 'start-immediately' | 'wait-for-setup'
  state:
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'skipped'
    | 'not_configured'
    | 'spawn_failed'
    | 'not_applicable'
}

export type OrchestrationWorkerTranscriptPage = {
  messages: NativeChatMessage[]
  nextCursor: string
  limited: boolean
  returnedMessageCount: number
}

export type OrchestrationWorkerReadResult =
  | {
      dispatchId: string
      source: 'transcript'
      sourceIdentity: string
      provider: AgentType
      transcript: OrchestrationWorkerTranscriptPage
      cursor: string
      status: { worker: string; terminal: TerminalState }
      fallbackReason: null
      warnings: string[]
    }
  | {
      dispatchId: string
      source: 'terminal'
      sourceIdentity: string
      terminal: TerminalRead
      cursor: string | null
      status: { worker: string; terminal: TerminalState }
      fallbackReason:
        | 'provider_unsupported'
        | 'session_not_reported'
        | 'transcript_missing'
        | 'transcript_unreadable'
        | 'transcript_parse_failed'
        | 'remote_capability_unavailable'
        | null
      warnings: string[]
    }

export type OrchestrationMutationMetadata = { requestId: string; replayed: boolean }
export type WithOrchestrationMutation<TResult> = TResult & {
  mutation?: OrchestrationMutationMetadata
}
