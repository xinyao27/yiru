import type { OrchestrationDb } from './db'
import { reconcileLifecycleMessage } from './lifecycle-reconciliation'
import type { MessageRow } from './types'

export type CoordinatorMessageOutcome = {
  completedTaskIds: string[]
  failedTaskIds: string[]
  escalations: MessageRow[]
}

function getPayloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const value = Reflect.get(payload, key)
  return typeof value === 'string' ? value : undefined
}

function getPayloadStringArray(payload: unknown, key: string): string[] | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const value: unknown = Reflect.get(payload, key)
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

function parseMessagePayload(payload: string | null): unknown {
  if (!payload) {
    return null
  }
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function handleEscalation(
  db: OrchestrationDb,
  message: MessageRow,
  onLog: (message: string) => void
): string | null {
  onLog(`Escalation from ${message.from_handle}: ${message.subject}`)
  const taskId = getPayloadString(parseMessagePayload(message.payload), 'taskId')
  if (!taskId) {
    return null
  }
  const task = db.getTask(taskId)
  if (!task || task.status === 'completed' || task.status === 'failed') {
    return null
  }
  const dispatch = db.getDispatchContext(taskId)
  if (!dispatch) {
    return null
  }
  const updated = db.failDispatch(dispatch.id, message.subject)
  if (updated?.status === 'circuit_broken') {
    onLog(`Task ${taskId} circuit broken after repeated failures`)
    db.updateTaskStatus(taskId, 'failed', `Circuit broken: ${message.subject}`)
    return taskId
  }
  onLog(`Task ${taskId} will be retried (failure ${updated?.failure_count ?? 0}/3)`)
  return null
}

function handleDecisionGate(
  db: OrchestrationDb,
  message: MessageRow,
  onLog: (message: string) => void
): void {
  onLog(`Decision gate from ${message.from_handle}: ${message.subject}`)
  const payload = parseMessagePayload(message.payload)
  const taskId = getPayloadString(payload, 'taskId')
  const question = getPayloadString(payload, 'question')
  if (!taskId || !question) {
    onLog('Warning: decision_gate missing taskId or question')
    return
  }
  db.createGate({
    taskId,
    question,
    options: getPayloadStringArray(payload, 'options')
  })
  onLog(`Task ${taskId} blocked on decision gate`)
}

export function processCoordinatorMessages(
  db: OrchestrationDb,
  coordinatorHandle: string,
  onLog: (message: string) => void
): CoordinatorMessageOutcome {
  const outcome: CoordinatorMessageOutcome = {
    completedTaskIds: [],
    failedTaskIds: [],
    escalations: []
  }
  const messages = db.getUnreadMessages(coordinatorHandle)
  for (const message of messages) {
    switch (message.type) {
      case 'worker_done':
      case 'heartbeat': {
        const result = reconcileLifecycleMessage(db, message, onLog)
        if (result.action === 'completed') {
          outcome.completedTaskIds.push(result.taskId)
        } else if (result.action === 'failed') {
          outcome.failedTaskIds.push(result.taskId)
        }
        break
      }
      case 'escalation': {
        outcome.escalations.push(message)
        const failedTaskId = handleEscalation(db, message, onLog)
        if (failedTaskId) {
          outcome.failedTaskIds.push(failedTaskId)
        }
        break
      }
      case 'decision_gate':
        handleDecisionGate(db, message, onLog)
        break
      case 'status':
        onLog(`Status from ${message.from_handle}: ${message.subject}`)
        break
      case 'dispatch':
      case 'handoff':
      case 'merge_ready':
      case 'question':
        break
    }
  }
  if (messages.length > 0) {
    db.markAsRead(messages.map((message) => message.id))
  }
  return outcome
}
