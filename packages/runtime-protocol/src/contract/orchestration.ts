import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import * as inputs from './orchestration-inputs.js'
import * as messageInputs from './orchestration-message-inputs.js'
import type * as results from './orchestration-results.js'
import * as workerInputs from './orchestration-worker-inputs.js'
import type * as workerResults from './orchestration-worker-results.js'

const PROJECT_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const PROJECT_CONTROL_ACCESS = { scope: 'project', tier: 'control' } as const
const PROJECT_HOST_ACCESS = { scope: 'project', tier: 'host' } as const
const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_CONTROL_ACCESS = { scope: 'host', tier: 'control' } as const
const HOST_HOST_ACCESS = { scope: 'host', tier: 'host' } as const

// Why: these 8 `federation*` leaves' only caller is main-process↔main-process
// worker-server dispatch (`callOrchestrationWorkerServer` in
// `yiru-runtime.ts`, reaching an independently-versioned paired host through
// `environment-transport-routing.ts`'s `callRuntimeEnvironment()`). That
// caller passes one of these contract objects rather than a bare method
// string, so slice 79's contract-gated negotiation picks it up once the
// peer's oRPC tunnel is confirmed — falling back to the bare envelope for a
// peer that still owns the legacy registration. The 4 mutation leaves below
// (`federationAck`/`federationImport`/`federationStop`/`federationAttachStart`)
// also carry an `orchestrationRequestId` envelope, which now rides the oRPC
// tunnel as headers (slice 84 Part B — see `environment-orpc-unary-client.ts`'s
// `buildRuntimeOrpcCallHeaders`) rather than forcing the bare-envelope path.
// Never used by mobile.
export type OrchestrationFederationPullLegacyContract = Readonly<{
  name: 'orchestration.federationPull'
  params: typeof workerInputs.OrchestrationFederationPullInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationPullResult
}>

export const ORCHESTRATION_FEDERATION_PULL_CONTRACT: OrchestrationFederationPullLegacyContract = {
  name: 'orchestration.federationPull',
  params: workerInputs.OrchestrationFederationPullInputSchema,
  mobile: false
}

export type OrchestrationFederationReadLegacyContract = Readonly<{
  name: 'orchestration.federationRead'
  params: typeof workerInputs.OrchestrationFederationReadInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationReadResult
}>

export const ORCHESTRATION_FEDERATION_READ_CONTRACT: OrchestrationFederationReadLegacyContract = {
  name: 'orchestration.federationRead',
  params: workerInputs.OrchestrationFederationReadInputSchema,
  mobile: false
}

export type OrchestrationFederationReadOutputLegacyContract = Readonly<{
  name: 'orchestration.federationReadOutput'
  params: typeof workerInputs.OrchestrationFederationOutputReadInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationReadOutputResult
}>

export const ORCHESTRATION_FEDERATION_READ_OUTPUT_CONTRACT: OrchestrationFederationReadOutputLegacyContract =
  {
    name: 'orchestration.federationReadOutput',
    params: workerInputs.OrchestrationFederationOutputReadInputSchema,
    mobile: false
  }

export type OrchestrationFederationShowLegacyContract = Readonly<{
  name: 'orchestration.federationShow'
  params: typeof workerInputs.OrchestrationFederationDispatchInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationShowResult
}>

export const ORCHESTRATION_FEDERATION_SHOW_CONTRACT: OrchestrationFederationShowLegacyContract = {
  name: 'orchestration.federationShow',
  params: workerInputs.OrchestrationFederationDispatchInputSchema,
  mobile: false
}

export type OrchestrationFederationAckLegacyContract = Readonly<{
  name: 'orchestration.federationAck'
  params: typeof workerInputs.OrchestrationFederationAckInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationAckResult
}>

export const ORCHESTRATION_FEDERATION_ACK_CONTRACT: OrchestrationFederationAckLegacyContract = {
  name: 'orchestration.federationAck',
  params: workerInputs.OrchestrationFederationAckInputSchema,
  mobile: false
}

export type OrchestrationFederationImportLegacyContract = Readonly<{
  name: 'orchestration.federationImport'
  params: typeof workerInputs.OrchestrationFederationImportInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationImportResult
}>

export const ORCHESTRATION_FEDERATION_IMPORT_CONTRACT: OrchestrationFederationImportLegacyContract =
  {
    name: 'orchestration.federationImport',
    params: workerInputs.OrchestrationFederationImportInputSchema,
    mobile: false
  }

export type OrchestrationFederationStopLegacyContract = Readonly<{
  name: 'orchestration.federationStop'
  params: typeof workerInputs.OrchestrationFederationDispatchInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationStopResult
}>

export const ORCHESTRATION_FEDERATION_STOP_CONTRACT: OrchestrationFederationStopLegacyContract = {
  name: 'orchestration.federationStop',
  params: workerInputs.OrchestrationFederationDispatchInputSchema,
  mobile: false
}

export type OrchestrationFederationAttachStartLegacyContract = Readonly<{
  name: 'orchestration.federationAttachStart'
  params: typeof workerInputs.OrchestrationFederationAttachStartInputSchema
  mobile: false
  resultType?: workerResults.OrchestrationFederationAttachStartResult
}>

export const ORCHESTRATION_FEDERATION_ATTACH_START_CONTRACT: OrchestrationFederationAttachStartLegacyContract =
  {
    name: 'orchestration.federationAttachStart',
    params: workerInputs.OrchestrationFederationAttachStartInputSchema,
    mobile: false
  }

export const orchestrationContract = {
  runCreate: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.OrchestrationRunCreateInputSchema)
    .output(type<results.OrchestrationRunBindingResult>()),
  runUse: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.OrchestrationRunUseInputSchema)
    .output(type<results.OrchestrationRunBindingResult>()),
  runCurrent: withAccess(PROJECT_READ_ACCESS)
    .input(inputs.OrchestrationRunCurrentInputSchema)
    .output(type<results.OrchestrationRunCurrentResult>()),
  runList: withAccess(PROJECT_READ_ACCESS)
    .input(inputs.OrchestrationEmptyInputSchema)
    .output(type<results.OrchestrationRunListResult>()),
  runShow: withAccess(PROJECT_READ_ACCESS)
    .input(inputs.OrchestrationRunShowInputSchema)
    .output(type<results.OrchestrationRunShowResult>()),
  workerStart: withAccess(HOST_HOST_ACCESS)
    .input(workerInputs.OrchestrationWorkerStartInputSchema)
    .output(type<workerResults.OrchestrationWorkerStartResult>()),
  workerShow: withAccess(HOST_READ_ACCESS)
    .input(workerInputs.OrchestrationWorkerDispatchInputSchema)
    .output(type<workerResults.OrchestrationWorkerShowResult>()),
  workerRead: withAccess(HOST_READ_ACCESS)
    .input(workerInputs.OrchestrationWorkerReadInputSchema)
    .output(type<workerResults.OrchestrationWorkerReadOutput>()),
  workerAbandon: withAccess(HOST_HOST_ACCESS)
    .input(workerInputs.OrchestrationWorkerDispatchInputSchema)
    .output(type<workerResults.OrchestrationWorkerAbandonResult>()),
  workerStop: withAccess(HOST_HOST_ACCESS)
    .input(workerInputs.OrchestrationWorkerDispatchInputSchema)
    .output(type<workerResults.OrchestrationWorkerStopResult>()),
  federationAttachStart: withAccess(HOST_HOST_ACCESS)
    .input(workerInputs.OrchestrationFederationAttachStartInputSchema)
    .output(type<workerResults.OrchestrationFederationAttachStartResult>()),
  federationPull: withAccess(HOST_CONTROL_ACCESS)
    .input(workerInputs.OrchestrationFederationPullInputSchema)
    .output(type<workerResults.OrchestrationFederationPullResult>()),
  federationAck: withAccess(HOST_CONTROL_ACCESS)
    .input(workerInputs.OrchestrationFederationAckInputSchema)
    .output(type<workerResults.OrchestrationFederationAckResult>()),
  federationImport: withAccess(HOST_HOST_ACCESS)
    .input(workerInputs.OrchestrationFederationImportInputSchema)
    .output(type<workerResults.OrchestrationFederationImportResult>()),
  federationShow: withAccess(HOST_READ_ACCESS)
    .input(workerInputs.OrchestrationFederationDispatchInputSchema)
    .output(type<workerResults.OrchestrationFederationShowResult>()),
  federationRead: withAccess(HOST_READ_ACCESS)
    .input(workerInputs.OrchestrationFederationReadInputSchema)
    .output(type<workerResults.OrchestrationFederationReadResult>()),
  federationReadOutput: withAccess(HOST_READ_ACCESS)
    .input(workerInputs.OrchestrationFederationOutputReadInputSchema)
    .output(type<workerResults.OrchestrationFederationReadOutputResult>()),
  federationStop: withAccess(HOST_HOST_ACCESS)
    .input(workerInputs.OrchestrationFederationDispatchInputSchema)
    .output(type<workerResults.OrchestrationFederationStopResult>()),
  // Why: `@all` resolves against every terminal on the host with no project
  // filter, so one send can reach every agent mailbox — hence host/control.
  send: withAccess(HOST_CONTROL_ACCESS)
    .input(messageInputs.OrchestrationMessageSendInputSchema)
    .output(type<results.OrchestrationSendResult>()),
  check: withAccess(PROJECT_READ_ACCESS)
    .input(messageInputs.OrchestrationMessageReadInputSchema)
    .output(type<results.OrchestrationCheckResult>()),
  reply: withAccess(PROJECT_CONTROL_ACCESS)
    .input(messageInputs.OrchestrationReplyInputSchema)
    .output(type<results.OrchestrationReplyResult>()),
  inbox: withAccess(PROJECT_READ_ACCESS)
    .input(messageInputs.OrchestrationInboxInputSchema)
    .output(type<results.OrchestrationInboxResult>()),
  taskCreate: withAccess(PROJECT_CONTROL_ACCESS)
    .input(inputs.OrchestrationTaskCreateInputSchema)
    .output(type<results.OrchestrationTaskCreateResult>()),
  taskList: withAccess(PROJECT_READ_ACCESS)
    .input(inputs.OrchestrationTaskListInputSchema)
    .output(type<results.OrchestrationTaskListResult>()),
  taskUpdate: withAccess(PROJECT_CONTROL_ACCESS)
    .input(inputs.OrchestrationTaskUpdateInputSchema)
    .output(type<results.OrchestrationTaskUpdateResult>()),
  dispatch: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.OrchestrationDispatchInputSchema)
    .output(type<results.OrchestrationDispatchResult>()),
  dispatchShow: withAccess(PROJECT_READ_ACCESS)
    .input(inputs.OrchestrationDispatchShowInputSchema)
    .output(type<results.OrchestrationDispatchShowResult>()),
  ask: withAccess(PROJECT_CONTROL_ACCESS)
    .input(messageInputs.OrchestrationAskInputSchema)
    .output(type<results.OrchestrationAskResult>()),
  run: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.OrchestrationCoordinatorRunInputSchema)
    .output(type<results.OrchestrationCoordinatorRunResult>()),
  runStop: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.OrchestrationEmptyInputSchema)
    .output(type<results.OrchestrationCoordinatorRunStopResult>()),
  gateCreate: withAccess(PROJECT_CONTROL_ACCESS)
    .input(inputs.OrchestrationGateCreateInputSchema)
    .output(type<results.OrchestrationGateCreateResult>()),
  gateResolve: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.OrchestrationGateResolveInputSchema)
    .output(type<results.OrchestrationGateResolveResult>()),
  gateList: withAccess(PROJECT_READ_ACCESS)
    .input(inputs.OrchestrationGateListInputSchema)
    .output(type<results.OrchestrationGateListResult>()),
  // Why: `--all` truncates every run, task, message and gate across all
  // projects on the host — not just the caller's run — hence host/host.
  reset: withAccess(HOST_HOST_ACCESS)
    .input(inputs.OrchestrationResetInputSchema)
    .output(type<results.OrchestrationResetResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './orchestration-inputs.js'
export * from './orchestration-message-inputs.js'
export * from './orchestration-results.js'
export * from './orchestration-types.js'
export * from './orchestration-worker-inputs.js'
export * from './orchestration-worker-results.js'
