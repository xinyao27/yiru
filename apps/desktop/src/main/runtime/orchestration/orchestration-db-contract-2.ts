import { OrchestrationDbContract1 } from './orchestration-db-contract-1'
import type {
  MessageType,
  MessagePriority,
  GateStatus,
  CoordinatorStatus,
  MessageRow,
  DispatchContextRow,
  DecisionGateRow,
  CoordinatorRun,
  WorkerReportOutcome,
  WorkerReportSettlement,
  WorkerDispatchRow,
  RemoteDispatchAttachmentRow,
  FederationRelayDirection,
  FederationRelayItemRow
} from './types'

export abstract class OrchestrationDbContract2 extends OrchestrationDbContract1 {
  abstract prepareRemoteAttachmentAuthority(params: {
    dispatchId: string
    paneKey: string
    processIncarnation: string
    worktreeId: string
    terminalHandle: string
    setupState: string
    effects: unknown[]
  }): string
  abstract markRemoteAttachmentReady(
    dispatchId: string,
    effects?: unknown[]
  ): RemoteDispatchAttachmentRow
  abstract failRemoteAttachment(
    dispatchId: string,
    stage: string,
    reason: string,
    unknown: boolean
  ): RemoteDispatchAttachmentRow
  abstract verifyRemoteAttachmentAuthority(params: {
    dispatchId: string
    capability: string | undefined
    paneKey: string | null
    processIncarnation: string | null
  }): boolean
  abstract isRemoteAttachmentProcessCurrent(params: {
    dispatchId: string
    paneKey: string | null
    processIncarnation: string | null
  }): boolean
  abstract beginRemoteAttachmentStop(dispatchId: string): RemoteDispatchAttachmentRow
  abstract settleRemoteAttachmentStop(dispatchId: string): RemoteDispatchAttachmentRow
  abstract markRemoteAttachmentStopUnknown(
    dispatchId: string,
    reason: string
  ): RemoteDispatchAttachmentRow
  abstract findActiveRemoteAttachmentForPane(
    paneKey: string
  ): RemoteDispatchAttachmentRow | undefined
  abstract enqueueFederationRelay(params: {
    dispatchId: string
    direction: FederationRelayDirection
    kind: string
    payload: string
    messageId?: string
    settleRemoteOutcome?: WorkerReportOutcome
    remoteQuestion?: true
  }): FederationRelayItemRow
  abstract listFederationRelay(params: {
    dispatchId: string
    direction: FederationRelayDirection
    afterSequence: number
    limit?: number
  }): FederationRelayItemRow[]
  abstract listPendingFederationRelay(
    dispatchId: string,
    direction: FederationRelayDirection,
    limit?: number
  ): FederationRelayItemRow[]
  abstract acknowledgeFederationRelay(params: {
    dispatchId: string
    direction: FederationRelayDirection
    throughSequence: number
  }): void
  abstract setFederatedHomeImportSequence(dispatchId: string, sequence: number): void
  abstract importFederatedRelayItem(params: {
    dispatchId: string
    sequence: number
    message: {
      id: string
      runId: string
      from: string
      to: string
      subject: string
      body: string
      type: MessageType
      priority: MessagePriority
      threadId?: string
      payload?: string
    }
    lifecycle:
      | { kind: 'none' }
      | { kind: 'heartbeat'; at: string }
      | {
          kind: 'worker_report'
          taskId: string
          outcome: WorkerReportOutcome
          result: string
        }
      | { kind: 'rejected'; code: string; reason: string }
  }): { message: MessageRow; duplicate: boolean }
  abstract getRemoteQuestion(messageId: string):
    | {
        message_id: string
        dispatch_id: string
        status: 'pending' | 'answered' | 'closed'
        answer_message_id: string | null
        answer_body: string | null
      }
    | undefined
  abstract answerRemoteQuestion(params: {
    messageId: string
    dispatchId: string
    answerMessageId: string
    body: string
  }): void
  abstract setRemoteWorkerImportSequence(dispatchId: string, sequence: number): void
  abstract registerFederatedQuestion(params: {
    messageId: string
    runId: string
    dispatchId: string
  }): void
  protected abstract getFederationRelayItem(
    dispatchId: string,
    direction: FederationRelayDirection,
    sequence: number
  ): FederationRelayItemRow | undefined
  protected abstract settleRemoteAttachmentInRelayTransaction(
    dispatchId: string,
    outcome: WorkerReportOutcome | undefined
  ): void
  abstract isDispatchProcessCurrent(params: {
    dispatchId: string
    paneKey: string | null
    processIncarnation: string | null
  }): boolean
  abstract beginWorkerStop(
    dispatchId: string
  ):
    | { disposition: 'stopping'; worker: WorkerDispatchRow; dispatch: DispatchContextRow }
    | { disposition: 'already_settled'; worker: WorkerDispatchRow; dispatch: DispatchContextRow }
  abstract settleWorkerStop(dispatchId: string): WorkerDispatchRow
  abstract reconcileFederatedWorkerStop(dispatchId: string): WorkerDispatchRow
  abstract resumeFederatedWorkerForTerminalRelay(dispatchId: string): WorkerDispatchRow
  abstract markWorkerStopUnknown(dispatchId: string, reason: string): WorkerDispatchRow
  abstract abandonWorkerDispatch(dispatchId: string): {
    disposition: 'abandoned' | 'already_abandoned' | 'stale'
    worker: WorkerDispatchRow
  }
  abstract createDispatchContext(
    taskId: string,
    assigneeHandle: string,
    // Why: pane key is the remint-stable identity behind the handle — lets worker_done ownership survive handle reissue.
    assigneePaneKey?: string
  ): DispatchContextRow
  abstract getDispatchContext(taskId: string): DispatchContextRow | undefined
  abstract getDispatchContextById(dispatchId: string): DispatchContextRow | undefined
  abstract mintDispatchCapability(params: {
    dispatchId: string
    paneKey: string
    processIncarnation: string
  }): string
  abstract verifyDispatchCapability(params: {
    dispatchId: string
    capability: string | undefined
    paneKey: string | undefined
    processIncarnation: string | undefined
  }): { valid: true } | { valid: false; reason: string }
  abstract revokeDispatchCapability(dispatchId: string): void
  abstract getActiveDispatchForTerminal(handle: string): DispatchContextRow | undefined
  abstract hasAnyDispatchContexts(): boolean
  abstract getActiveDispatchForIdentity(
    handle: string,
    paneKey?: string
  ): DispatchContextRow | undefined
  protected abstract findActiveDispatchForAssignee(
    assigneeHandle: string,
    assigneePaneKey?: string
  ): DispatchContextRow | undefined
  abstract getLatestDispatchForTerminal(handle: string): DispatchContextRow | undefined
  abstract completeDispatch(ctxId: string): void
  abstract completeActiveDispatchForTask(taskId: string): void
  abstract settleWorkerReport(params: {
    taskId: string
    dispatchId: string
    outcome: WorkerReportOutcome
    result: string
  }): WorkerReportSettlement
  protected abstract settleWorkerReportInTransaction(params: {
    taskId: string
    dispatchId: string
    outcome: WorkerReportOutcome
    result: string
  }): WorkerReportSettlement
  abstract failActiveDispatchForTask(taskId: string, error: string): DispatchContextRow | undefined
  abstract recordHeartbeat(dispatchId: string, at: string): void
  abstract getStaleDispatches(thresholdIso: string): DispatchContextRow[]
  abstract failDispatch(ctxId: string, error: string): DispatchContextRow | undefined
  abstract createGate(gate: {
    taskId: string
    question: string
    options?: string[]
  }): DecisionGateRow
  abstract resolveGate(gateId: string, resolution: string): DecisionGateRow | undefined
  abstract timeoutGate(gateId: string): DecisionGateRow | undefined
  abstract listGates(filter?: { taskId?: string; status?: GateStatus }): DecisionGateRow[]
  abstract getGate(id: string): DecisionGateRow | undefined
  abstract createCoordinatorRun(run: {
    spec: string
    coordinatorHandle: string
    pollIntervalMs?: number
  }): CoordinatorRun
  abstract getCoordinatorRun(id: string): CoordinatorRun | undefined
  abstract updateCoordinatorRun(id: string, status: CoordinatorStatus): CoordinatorRun | undefined
  abstract getActiveCoordinatorRun(): CoordinatorRun | undefined
  abstract getIdleTerminals(excludeHandles?: string[]): string[]
  protected abstract runResetTransaction(statements: string): void
  abstract resetAll(): void
  abstract resetTasks(): void
  abstract resetMessages(): void
  abstract close(): void
}
