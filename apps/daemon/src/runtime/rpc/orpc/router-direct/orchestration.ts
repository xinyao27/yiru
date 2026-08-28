import { handleOrchestrationAsk } from '~main/runtime/rpc/methods/orchestration/ask'
import {
  handleOrchestrationDispatch,
  handleOrchestrationDispatchShow
} from '~main/runtime/rpc/methods/orchestration/dispatch'
import { handleOrchestrationFederationAttachStart } from '~main/runtime/rpc/methods/orchestration/federation/attach'
import {
  handleOrchestrationFederationRead,
  handleOrchestrationFederationReadOutput,
  handleOrchestrationFederationShow,
  handleOrchestrationFederationStop
} from '~main/runtime/rpc/methods/orchestration/federation/control'
import {
  handleOrchestrationFederationAck,
  handleOrchestrationFederationImport,
  handleOrchestrationFederationPull
} from '~main/runtime/rpc/methods/orchestration/federation/relay'
import {
  handleOrchestrationCoordinatorRun,
  handleOrchestrationCoordinatorRunStop,
  handleOrchestrationGateCreate,
  handleOrchestrationGateList,
  handleOrchestrationGateResolve
} from '~main/runtime/rpc/methods/orchestration/gates'
import { handleOrchestrationCheck } from '~main/runtime/rpc/methods/orchestration/message-check'
import {
  handleOrchestrationInbox,
  handleOrchestrationReply
} from '~main/runtime/rpc/methods/orchestration/message-history'
import { handleOrchestrationSend } from '~main/runtime/rpc/methods/orchestration/message-send'
import { handleOrchestrationReset } from '~main/runtime/rpc/methods/orchestration/reset'
import {
  handleOrchestrationRunCreate,
  handleOrchestrationRunCurrent,
  handleOrchestrationRunList,
  handleOrchestrationRunShow,
  handleOrchestrationRunUse
} from '~main/runtime/rpc/methods/orchestration/runs'
import {
  handleOrchestrationTaskCreate,
  handleOrchestrationTaskList,
  handleOrchestrationTaskUpdate
} from '~main/runtime/rpc/methods/orchestration/tasks'
import {
  handleOrchestrationWorkerAbandon,
  handleOrchestrationWorkerShow
} from '~main/runtime/rpc/methods/orchestration/worker/control'
import { handleOrchestrationWorkerRead } from '~main/runtime/rpc/methods/orchestration/worker/read'
import { handleOrchestrationWorkerStart } from '~main/runtime/rpc/methods/orchestration/worker/start'
import { handleOrchestrationWorkerStop } from '~main/runtime/rpc/methods/orchestration/worker/stop'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: all 34 orchestration leaves are wired here with no legacy
// `defineMethod` registration left anywhere in
// methods/orchestration/**/*.ts — including the 8 `federation*` leaves, whose
// only caller is the main-process↔main-process worker-server dispatch
// (`callOrchestrationWorkerServer` in yiru-runtime.ts, reaching an
// independently-versioned paired host through
// `OrchestrationEnvironmentTransport.call`). Slice 82 retired the 26
// non-federation leaves (no main-process↔main-process caller at all: CLI
// always uses real oRPC, the one renderer call site already negotiates via
// `callRuntimeOrpc`). Slice 84 retired the 8 `federation*` leaves in two
// parts: Part A (`federationPull`/`federationRead`/`federationReadOutput`/
// `federationShow`) passed no envelope, so a real `RuntimeMethodContract`
// object alone unblocked the slice 79 negotiation gate. Part B
// (`federationAck`/`federationImport`/`federationAttachStart`/`federationStop`)
// also carries an `orchestrationRequestId` envelope, which used to resolve to
// the bare-envelope path before the oRPC gate ever ran
// (`environment-transport-routing.ts`'s old `options.envelope` branch order);
// it now rides the oRPC tunnel as headers instead
// (`environment-orpc-unary-client.ts`'s `buildRuntimeOrpcCallHeaders`, read
// server-side by `request-metadata.ts` regardless of transport). Every one of
// these 8 still falls back to the bare-envelope legacy dispatcher for an
// older peer that lacks the oRPC capability — that fallback, not this direct
// wiring, is what keeps cross-version worker-server pairs working.
export const orchestrationRuntimeHandlers = {
  orchestration: {
    ask: runtimeImplementation.orchestration.ask.handler(
      wireRuntimeMethod('orchestration.ask', handleOrchestrationAsk)
    ),
    check: runtimeImplementation.orchestration.check.handler(
      wireRuntimeMethod('orchestration.check', handleOrchestrationCheck)
    ),
    dispatch: runtimeImplementation.orchestration.dispatch.handler(
      wireRuntimeMethod('orchestration.dispatch', handleOrchestrationDispatch)
    ),
    dispatchShow: runtimeImplementation.orchestration.dispatchShow.handler(
      wireRuntimeMethod('orchestration.dispatchShow', handleOrchestrationDispatchShow)
    ),
    federationAck: runtimeImplementation.orchestration.federationAck.handler(
      wireRuntimeMethod('orchestration.federationAck', handleOrchestrationFederationAck)
    ),
    federationAttachStart: runtimeImplementation.orchestration.federationAttachStart.handler(
      wireRuntimeMethod(
        'orchestration.federationAttachStart',
        handleOrchestrationFederationAttachStart
      )
    ),
    federationImport: runtimeImplementation.orchestration.federationImport.handler(
      wireRuntimeMethod('orchestration.federationImport', handleOrchestrationFederationImport)
    ),
    federationPull: runtimeImplementation.orchestration.federationPull.handler(
      wireRuntimeMethod('orchestration.federationPull', handleOrchestrationFederationPull)
    ),
    federationRead: runtimeImplementation.orchestration.federationRead.handler(
      wireRuntimeMethod('orchestration.federationRead', handleOrchestrationFederationRead)
    ),
    federationReadOutput: runtimeImplementation.orchestration.federationReadOutput.handler(
      wireRuntimeMethod(
        'orchestration.federationReadOutput',
        handleOrchestrationFederationReadOutput
      )
    ),
    federationShow: runtimeImplementation.orchestration.federationShow.handler(
      wireRuntimeMethod('orchestration.federationShow', handleOrchestrationFederationShow)
    ),
    federationStop: runtimeImplementation.orchestration.federationStop.handler(
      wireRuntimeMethod('orchestration.federationStop', handleOrchestrationFederationStop)
    ),
    gateCreate: runtimeImplementation.orchestration.gateCreate.handler(
      wireRuntimeMethod('orchestration.gateCreate', handleOrchestrationGateCreate)
    ),
    gateList: runtimeImplementation.orchestration.gateList.handler(
      wireRuntimeMethod('orchestration.gateList', handleOrchestrationGateList)
    ),
    gateResolve: runtimeImplementation.orchestration.gateResolve.handler(
      wireRuntimeMethod('orchestration.gateResolve', handleOrchestrationGateResolve)
    ),
    inbox: runtimeImplementation.orchestration.inbox.handler(
      wireRuntimeMethod('orchestration.inbox', handleOrchestrationInbox)
    ),
    reply: runtimeImplementation.orchestration.reply.handler(
      wireRuntimeMethod('orchestration.reply', handleOrchestrationReply)
    ),
    reset: runtimeImplementation.orchestration.reset.handler(
      wireRuntimeMethod('orchestration.reset', handleOrchestrationReset)
    ),
    run: runtimeImplementation.orchestration.run.handler(
      wireRuntimeMethod('orchestration.run', handleOrchestrationCoordinatorRun)
    ),
    runCreate: runtimeImplementation.orchestration.runCreate.handler(
      wireRuntimeMethod('orchestration.runCreate', handleOrchestrationRunCreate)
    ),
    runCurrent: runtimeImplementation.orchestration.runCurrent.handler(
      wireRuntimeMethod('orchestration.runCurrent', handleOrchestrationRunCurrent)
    ),
    runList: runtimeImplementation.orchestration.runList.handler(
      wireRuntimeMethod('orchestration.runList', handleOrchestrationRunList)
    ),
    runShow: runtimeImplementation.orchestration.runShow.handler(
      wireRuntimeMethod('orchestration.runShow', handleOrchestrationRunShow)
    ),
    runStop: runtimeImplementation.orchestration.runStop.handler(
      wireRuntimeMethod('orchestration.runStop', handleOrchestrationCoordinatorRunStop)
    ),
    runUse: runtimeImplementation.orchestration.runUse.handler(
      wireRuntimeMethod('orchestration.runUse', handleOrchestrationRunUse)
    ),
    send: runtimeImplementation.orchestration.send.handler(
      wireRuntimeMethod('orchestration.send', handleOrchestrationSend)
    ),
    taskCreate: runtimeImplementation.orchestration.taskCreate.handler(
      wireRuntimeMethod('orchestration.taskCreate', handleOrchestrationTaskCreate)
    ),
    taskList: runtimeImplementation.orchestration.taskList.handler(
      wireRuntimeMethod('orchestration.taskList', handleOrchestrationTaskList)
    ),
    taskUpdate: runtimeImplementation.orchestration.taskUpdate.handler(
      wireRuntimeMethod('orchestration.taskUpdate', handleOrchestrationTaskUpdate)
    ),
    workerAbandon: runtimeImplementation.orchestration.workerAbandon.handler(
      wireRuntimeMethod('orchestration.workerAbandon', handleOrchestrationWorkerAbandon)
    ),
    workerRead: runtimeImplementation.orchestration.workerRead.handler(
      wireRuntimeMethod('orchestration.workerRead', handleOrchestrationWorkerRead)
    ),
    workerShow: runtimeImplementation.orchestration.workerShow.handler(
      wireRuntimeMethod('orchestration.workerShow', handleOrchestrationWorkerShow)
    ),
    workerStart: runtimeImplementation.orchestration.workerStart.handler(
      wireRuntimeMethod('orchestration.workerStart', handleOrchestrationWorkerStart)
    ),
    workerStop: runtimeImplementation.orchestration.workerStop.handler(
      wireRuntimeMethod('orchestration.workerStop', handleOrchestrationWorkerStop)
    )
  }
} as const
