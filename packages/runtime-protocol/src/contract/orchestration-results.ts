import type { RuntimeJsonValue } from './json-value.js'
import type {
  OrchestrationDispatch,
  OrchestrationGate,
  OrchestrationMessage,
  OrchestrationQuestion,
  OrchestrationRun,
  OrchestrationTask,
  OrchestrationTaskListItem,
  WithOrchestrationMutation
} from './orchestration-types.js'

export type OrchestrationRunBindingResult = WithOrchestrationMutation<{
  run: OrchestrationRun
  binding: { consumerGeneration: number }
}>
export type OrchestrationRunCurrentResult = { run: OrchestrationRun | null }
export type OrchestrationRunListResult = { runs: OrchestrationRun[] }
export type OrchestrationRunShowResult = { run: OrchestrationRun }

export type OrchestrationTaskCreateResult = WithOrchestrationMutation<{
  task: OrchestrationTask
}>
export type OrchestrationTaskListResult = {
  runId: string
  legacyReadOnly: boolean
  tasks: OrchestrationTaskListItem[]
  count: number
}
export type OrchestrationTaskUpdateResult = WithOrchestrationMutation<{
  task: OrchestrationTask
}>

export type OrchestrationDispatchResult = WithOrchestrationMutation<
  | {
      dispatch: OrchestrationDispatch
      injected: boolean
      preamble?: string
    }
  | {
      dispatch: null
      injected: false
      dryRun: true
      preamble: string
    }
>
export type OrchestrationDispatchShowResult = {
  dispatch: OrchestrationDispatch | null
  preamble?: string
}

export type OrchestrationAskResult = WithOrchestrationMutation<{
  answer: string | null
  messageId: string
  answerMessageId?: string | null
  threadId: string
  timedOut: boolean
  cancelled: boolean
  connectionLost: boolean
  timeoutMs: number
}>

export type OrchestrationCheckResult = WithOrchestrationMutation<{
  messages: OrchestrationMessage[]
  count: number
  runId?: string
  dispatchId?: string
  deliveryId?: string | null
  replayed?: boolean
  acknowledged?: string | null
  timedOut?: boolean
  cancelled?: boolean
  connectionLost?: boolean
  formatted?: string
}>

export type OrchestrationLifecycleResult =
  | { action: 'ignored' }
  | { action: 'suppressed' }
  | { action: 'rejected'; code: string; reason: string }
  | { action: 'completed' | 'failed'; taskId: string; dispatchId: string }
  | { action: 'heartbeat_recorded'; dispatchId: string }

export type OrchestrationRelayAcceptance = {
  messageId: string
  sequence: number
  dispatchId: string
  destination: 'run_home' | 'worker'
  accepted: true
}

export type OrchestrationSendResult = WithOrchestrationMutation<
  | { message: OrchestrationMessage; lifecycle?: OrchestrationLifecycleResult }
  | { messages: OrchestrationMessage[]; recipients: number }
  | {
      relay: OrchestrationRelayAcceptance
      lifecycle?: { action: 'completed' | 'failed' }
    }
>

export type OrchestrationReplyResult = WithOrchestrationMutation<
  | { message: OrchestrationMessage }
  | {
      message: OrchestrationMessage
      question: OrchestrationQuestion
      duplicate: boolean
    }
>
export type OrchestrationInboxResult = { messages: OrchestrationMessage[]; count: number }

export type OrchestrationCoordinatorRunResult = {
  runId: string
  status: 'running'
}
export type OrchestrationCoordinatorRunStopResult = { runId: string; stopped: true }
export type OrchestrationGateCreateResult = WithOrchestrationMutation<{
  gate: OrchestrationGate
}>
export type OrchestrationGateResolveResult = WithOrchestrationMutation<{
  gate: OrchestrationGate
}>
export type OrchestrationGateListResult = { gates: OrchestrationGate[]; count: number }
export type OrchestrationResetResult = WithOrchestrationMutation<{
  reset: 'all' | 'tasks' | 'messages'
}>

export type OrchestrationDynamicReceiptValue = RuntimeJsonValue
