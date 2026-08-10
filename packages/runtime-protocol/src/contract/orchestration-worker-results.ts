import type { RuntimeJsonValue } from './json-value.js'
import type {
  OrchestrationDispatch,
  OrchestrationFederationRelayItem,
  OrchestrationRemoteAttachment,
  OrchestrationWorker,
  OrchestrationWorkerReadResult,
  OrchestrationWorkerSetupReceipt,
  WithOrchestrationMutation
} from './orchestration-types.js'
import type { TerminalClose, TerminalRead, TerminalShow } from './terminal-results.js'

export type OrchestrationWorkerStartResult = WithOrchestrationMutation<{
  runId?: string
  taskId: string
  dispatchId: string
  state: string
  stage: string
  server?: { environmentId?: string; name: string }
  setup?: OrchestrationWorkerSetupReceipt | { state: string }
  timeoutMs?: number
  failedStage?: string
  lastError?: string | null
  effects: RuntimeJsonValue[]
  residualResources: RuntimeJsonValue[]
  warning?: string
  nextCommands?: string[]
}>

export type OrchestrationWorkerShowResult = {
  dispatch: OrchestrationDispatch | null
  worker: OrchestrationWorker
  server?: { environmentId: string; name: string }
  remoteRuntimeEpoch?: string
  terminal: TerminalShow | null
  observation: { status: string; exactWorker: boolean }
}

export type OrchestrationWorkerReadOutput = OrchestrationWorkerReadResult & {
  server?: { environmentId: string; name: string }
  remoteRuntimeEpoch?: string
}

export type OrchestrationWorkerAbandonResult = WithOrchestrationMutation<{
  dispatchId: string
  state: string
  alreadySettled: boolean
  stale: boolean
  processAction: 'none'
  warning: string
  residualResources: RuntimeJsonValue[]
}>

export type OrchestrationWorkerStopResult = WithOrchestrationMutation<{
  dispatchId: string
  state: string
  alreadySettled: boolean
  processAction: string
  close?: TerminalClose | RuntimeJsonValue
  lastError?: string | null
}>

export type OrchestrationFederationAttachStartResult = WithOrchestrationMutation<{
  dispatchId: string
  state: string
  stage: string
  runtimeEpoch: string
  worktreeId?: string
  terminalHandle?: string
  setup: OrchestrationWorkerSetupReceipt
  failedStage?: string
  lastError?: string
  effects: RuntimeJsonValue[]
  residualResources: RuntimeJsonValue[]
}>

export type OrchestrationFederationPullResult = {
  dispatchId: string
  runtimeEpoch: string
  items: OrchestrationFederationRelayItem[]
}
export type OrchestrationFederationAckResult = WithOrchestrationMutation<{
  dispatchId: string
  acknowledgedThrough: number
}>
export type OrchestrationFederationImportResult = WithOrchestrationMutation<{
  dispatchId: string
  acknowledgedThrough: number
  imported: number
}>

export type OrchestrationFederationShowResult = {
  dispatchId: string
  runtimeEpoch: string
  attachment: OrchestrationRemoteAttachment
  terminal: TerminalShow | null
  observation: { status: string; exactWorker: boolean }
}
export type OrchestrationFederationReadResult = {
  dispatchId: string
  runtimeEpoch: string
  terminal: TerminalRead
}
export type OrchestrationFederationReadOutputResult = {
  dispatchId: string
  runtimeEpoch: string
  output: OrchestrationWorkerReadResult
}
export type OrchestrationFederationStopResult = WithOrchestrationMutation<{
  dispatchId: string
  state: string
  alreadySettled: boolean
  processAction: string
  close?: TerminalClose
  lastError?: string | null
}>
