import { parsePositiveSafeIntegerText } from '~shared/timer-delay'

import { getOptionalStringFlag } from '../flags'
import type { RuntimeClient } from '../runtime-client'
import { RuntimeClientError } from '../runtime-client'
import type { RuntimeOrpcProcedure } from '../runtime/orpc-client-types'
import type { RuntimeRpcSuccess } from '../runtime/types'

export const TASK_STATUS_VALUES = [
  'pending',
  'ready',
  'dispatched',
  'completed',
  'failed',
  'blocked'
] as const
export const MESSAGE_TYPE_VALUES = [
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
export const MESSAGE_PRIORITY_VALUES = ['normal', 'high', 'urgent'] as const
export const WORKER_SETUP_VALUES = ['run', 'skip', 'inherit'] as const
export const WORKER_READ_SOURCE_VALUES = ['auto', 'transcript', 'terminal'] as const
export const GATE_STATUS_VALUES = ['pending', 'resolved', 'timeout'] as const

export function getOptionalStructuredMessagePayload(
  flags: Map<string, string | boolean>
): string | undefined {
  const rawPayload = getOptionalStringFlag(flags, 'payload')
  const taskId = getOptionalStringFlag(flags, 'task-id')
  const dispatchId = getOptionalStringFlag(flags, 'dispatch-id')
  const outcome = getOptionalStringFlag(flags, 'outcome')
  const filesModified = getOptionalStringFlag(flags, 'files-modified')
  const reportPath = getOptionalStringFlag(flags, 'report-path')
  const phase = getOptionalStringFlag(flags, 'phase')
  if (
    taskId === undefined &&
    dispatchId === undefined &&
    outcome === undefined &&
    filesModified === undefined &&
    reportPath === undefined &&
    phase === undefined
  ) {
    return rawPayload
  }
  if (rawPayload !== undefined) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --payload or structured payload flags, not both.'
    )
  }
  const payload: Record<string, string | string[]> = {}
  if (taskId) {
    payload.taskId = taskId
  }
  if (dispatchId) {
    payload.dispatchId = dispatchId
  }
  if (outcome) {
    if (outcome !== 'succeeded' && outcome !== 'failed') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Invalid --outcome. Expected succeeded or failed.'
      )
    }
    payload.outcome = outcome
  }
  if (filesModified) {
    payload.filesModified = filesModified
      .split(',')
      .map((file) => file.trim())
      .filter(Boolean)
  }
  if (reportPath) {
    payload.reportPath = reportPath
  }
  if (phase) {
    payload.phase = phase
  }
  return JSON.stringify(payload)
}

export function getOptionalPositiveIntegerValueFlag(
  flags: Map<string, string | boolean>,
  name: string
): number | undefined {
  if (!flags.has(name)) {
    return undefined
  }
  const raw = flags.get(name)
  if (typeof raw !== 'string' || !raw) {
    throw new RuntimeClientError('invalid_argument', `Missing value for --${name}.`)
  }
  const value = parsePositiveSafeIntegerText(raw)
  if (value === null) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Invalid positive safe integer for --${name}: ${raw}`
    )
  }
  return value
}

export function rejectLifecycleGroupRecipient(type: string | undefined, to: string): void {
  if ((type === 'worker_done' || type === 'heartbeat') && to.startsWith('@')) {
    throw new RuntimeClientError(
      'invalid_argument',
      `${type} messages belong to one exact Dispatch and cannot target a group address.`
    )
  }
}

export function requireChoice<TValue extends string>(
  value: string,
  choices: readonly TValue[],
  message: string
): TValue {
  for (const choice of choices) {
    if (value === choice) {
      return choice
    }
  }
  throw new RuntimeClientError('invalid_argument', message)
}

export function getOptionalChoiceFlag<TValue extends string>(
  flags: Map<string, string | boolean>,
  name: string,
  choices: readonly TValue[]
): TValue | undefined {
  const value = getOptionalStringFlag(flags, name)
  return value === undefined
    ? undefined
    : requireChoice(value, choices, `Invalid --${name}. Expected one of: ${choices.join(', ')}.`)
}

export function callOrchestrationMutation<TInput, TOutput>(
  client: RuntimeClient,
  flags: Map<string, string | boolean>,
  procedure: RuntimeOrpcProcedure<TInput, TOutput>,
  params: TInput,
  options?: { timeoutMs?: number; orchestrationCapability?: string }
): Promise<RuntimeRpcSuccess<TOutput>> {
  const requestId = getOptionalStringFlag(flags, 'retry-request')
  if (!requestId) {
    return options ? client.call(procedure, params, options) : client.call(procedure, params)
  }
  return client.call(procedure, params, { ...options, orchestrationRequestId: requestId })
}

export function isDevCliInvocation(): boolean {
  return process.env.YIRU_CLI_ENVIRONMENT === 'development'
}
