import { OrchestrationDbBase } from './orchestration-db-base'
import type {
  MessageType,
  MessagePriority,
  TaskStatus,
  MessageRow,
  TaskRow,
  DispatchContextRow,
  RunRow,
  DeliveryRow,
  QuestionRow,
  MutationReceiptRow,
  WorkerDispatchRow,
  WorkerDispatchState,
  FederatedDispatchRow,
  RemoteDispatchAttachmentRow
} from './types'

export abstract class OrchestrationDbContract1 extends OrchestrationDbBase {
  protected abstract hasColumn(table: string, column: string): boolean
  protected abstract createUndeliveredInboxIndexIfPossible(): void
  protected abstract messagesTypeCheckAllowsHeartbeat(): boolean
  protected abstract messagesTypeCheckAllowsQuestion(): boolean
  abstract beginMutationReceipt(params: {
    callerFingerprint: string
    requestId: string
    method: string
    payloadHash: string
  }):
    | { disposition: 'started'; row: MutationReceiptRow }
    | { disposition: 'pending'; row: MutationReceiptRow }
    | { disposition: 'completed'; row: MutationReceiptRow }
  abstract completeMutationReceipt(params: {
    callerFingerprint: string
    requestId: string
    method: string
    payloadHash: string
    receipt: string
  }): MutationReceiptRow
  abstract discardPendingMutationReceipt(callerFingerprint: string, requestId: string): void
  abstract getMutationReceipt(
    callerFingerprint: string,
    requestId: string
  ): MutationReceiptRow | undefined
  abstract createRun(params: {
    objective: string
    coordinatorHandle: string
    coordinatorPaneKey: string
  }): RunRow
  abstract bindRun(params: {
    runId: string
    coordinatorHandle: string
    coordinatorPaneKey: string
  }): RunRow | undefined
  abstract getRun(id: string): RunRow | undefined
  abstract listRuns(): RunRow[]
  abstract getCurrentRunForPane(paneKey: string): RunRow | undefined
  protected abstract getRunRaw(id: string): RunRow | undefined
  protected abstract unbindOtherRunsForPane(paneKey: string, exceptRunId?: string): void
  protected abstract requireRun(runId: string): void
  protected abstract fenceOutstandingDelivery(runId: string): void
  protected abstract requireCurrentConsumer(runId: string, consumerGeneration: number): RunRow
  protected abstract getDeliveryRaw(id: string): DeliveryRow | undefined
  protected abstract getDeliveryMessages(delivery: DeliveryRow): MessageRow[]
  abstract getOrCreateRunDelivery(params: {
    runId: string
    consumerGeneration: number
    limit?: number
    wakeTypes?: MessageType[]
  }): { delivery: DeliveryRow; messages: MessageRow[]; replayed: boolean } | undefined
  abstract acknowledgeRunDelivery(params: {
    runId: string
    consumerGeneration: number
    deliveryId: string
  }): { delivery: DeliveryRow; duplicate: boolean }
  abstract getRunMailboxHistory(runId: string, limit?: number, types?: MessageType[]): MessageRow[]
  abstract insertMessage(msg: {
    id?: string
    from: string
    to: string
    subject: string
    body?: string
    type?: MessageType
    priority?: MessagePriority
    threadId?: string
    payload?: string
    senderPaneKey?: string
    runId?: string
  }): MessageRow
  abstract getUnreadMessages(toHandle: string, types?: MessageType[]): MessageRow[]
  abstract convertLifecycleMessageToRejection(
    messageId: string,
    code: string,
    reason: string
  ): MessageRow | undefined
  abstract getUndeliveredUnreadMessages(toHandle: string, types?: MessageType[]): MessageRow[]
  abstract getAllMessages(toHandle: string, limit?: number): MessageRow[]
  abstract getMessageById(id: string): MessageRow | undefined
  abstract markAsRead(ids: string[]): void
  abstract markAsDelivered(ids: string[]): void
  abstract markAsReadAndDelivered(ids: string[]): void
  abstract getInbox(limit?: number): MessageRow[]
  abstract getAllMessagesForHandle(
    toHandle: string,
    limit?: number,
    types?: MessageType[]
  ): MessageRow[]
  abstract getThreadMessagesFor(
    threadId: string,
    toHandle: string,
    afterSequence?: number
  ): MessageRow[]
  abstract createQuestion(params: {
    runId: string
    dispatchId: string
    askerHandle: string
    question: string
    options?: string[]
  }): { question: QuestionRow; message: MessageRow }
  abstract getQuestion(messageId: string): QuestionRow | undefined
  protected abstract getQuestionRaw(messageId: string): QuestionRow | undefined
  abstract answerQuestion(params: {
    messageId: string
    runId: string
    consumerGeneration: number
    body: string
  }): { question: QuestionRow; message: MessageRow; duplicate: boolean }
  abstract closeQuestionsForDispatch(dispatchId: string): string[]
  abstract createTask(task: {
    spec: string
    taskTitle?: string
    displayName?: string
    deps?: string[]
    parentId?: string
    createdByTerminalHandle?: string
    runId?: string
  }): TaskRow
  abstract getTask(id: string): TaskRow | undefined
  abstract listTasks(filter?: { status?: TaskStatus; ready?: boolean; runId?: string }): TaskRow[]
  abstract listTasksWithDispatch(filter?: {
    status?: TaskStatus
    ready?: boolean
    runId?: string
  }): (TaskRow & {
    assignee_handle: string | null
    dispatch_id: string | null
  })[]
  abstract updateTaskStatus(id: string, status: TaskStatus, result?: string): TaskRow | undefined
  protected abstract promoteReadyTasks(completedTaskId: string): void
  abstract createStartingWorkerDispatch(params: {
    taskId: string
    startOptions: unknown
    retryOf?: string
    runtimeEpoch?: string
    federation?: {
      environmentId: string
      environmentName: string
      peerFingerprint: string
      protocolVersion: number
    }
    mutationReceipt?: {
      callerFingerprint: string
      requestId: string
      method: string
      payloadHash: string
    }
  }): { dispatch: DispatchContextRow; worker: WorkerDispatchRow }
  abstract recordWorkerStage(params: {
    dispatchId: string
    stage: string
    worktreeId?: string
    terminalHandle?: string
    setupState?: string
    effects?: unknown[]
    residualResources?: unknown[]
    lastError?: string
    state?: WorkerDispatchState
  }): WorkerDispatchRow
  abstract updateWorkerSetupEvidence(params: {
    dispatchId: string
    setupState: string
    effects: unknown[]
  }): { worker: WorkerDispatchRow; changed: boolean }
  abstract prepareStartingWorkerAuthority(params: {
    dispatchId: string
    handle: string
    paneKey: string
    processIncarnation: string
    worktreeId: string
    effects: unknown[]
    setupState: string
  }): string
  abstract markWorkerDispatchReady(dispatchId: string, effects?: unknown[]): WorkerDispatchRow
  abstract failWorkerStart(dispatchId: string, stage: string, reason: string): WorkerDispatchRow
  abstract markWorkerStartUnknown(
    dispatchId: string,
    stage: string,
    reason: string
  ): WorkerDispatchRow
  abstract reconcileFederatedWorkerStart(params: {
    dispatchId: string
    state: 'ready' | 'failed' | 'stopped' | 'start_unknown'
    stage: string
    lastError?: string | null
    worktreeId?: string | null
    terminalHandle?: string | null
    setupState?: string
    effects?: unknown[]
    residualResources?: unknown[]
  }): WorkerDispatchRow
  abstract getWorkerDispatch(dispatchId: string): WorkerDispatchRow | undefined
  abstract getFederatedDispatch(dispatchId: string): FederatedDispatchRow | undefined
  abstract listActiveFederatedDispatches(runId?: string): FederatedDispatchRow[]
  abstract updateFederatedDispatchResources(params: {
    dispatchId: string
    remoteRuntimeEpoch: string
    worktreeId: string
    terminalHandle: string
  }): FederatedDispatchRow
  abstract createRemoteDispatchAttachment(params: {
    dispatchId: string
    taskId: string
    homePeerFingerprint: string
    protocolVersion: number
    runtimeEpoch: string
    mutationReceipt: {
      callerFingerprint: string
      requestId: string
      method: string
      payloadHash: string
    }
  }): RemoteDispatchAttachmentRow
  abstract getRemoteDispatchAttachment(dispatchId: string): RemoteDispatchAttachmentRow | undefined
  abstract recordRemoteAttachmentStage(params: {
    dispatchId: string
    stage: string
    state?: WorkerDispatchState
    worktreeId?: string
    terminalHandle?: string
    setupState?: string
    effects?: unknown[]
    residualResources?: unknown[]
    lastError?: string
  }): RemoteDispatchAttachmentRow
  abstract updateRemoteAttachmentSetupEvidence(params: {
    dispatchId: string
    setupState: string
    effects: unknown[]
  }): { attachment: RemoteDispatchAttachmentRow; changed: boolean }
}
