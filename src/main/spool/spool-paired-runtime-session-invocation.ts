import {
  SpoolPairedRuntimeSessionInvokeParamsSchema,
  type SpoolPairedRuntimeSessionRecord
} from '../../shared/spool/spool-paired-runtime-session-contract'
import {
  SpoolPairedRuntimeInvokeResponseSchema,
  parseSpoolPairedRuntimeResult
} from '../../shared/spool/spool-paired-runtime-result-contract'
import type { SpoolExecutionOperation } from '../../shared/spool/spool-operation-contract'
import { callRuntimeEnvironmentExistingRoute } from '../ipc/runtime-environment-existing-route'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolHostOperationContext } from './spool-execution-gateway'
import type { SpoolOwnerHistoricalSessionRecord } from './spool-session-source'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import { boundPairedRuntimeTargetSelector } from './spool-paired-runtime-target-binding'

type SessionOperation = Extract<
  SpoolExecutionOperation,
  { kind: 'session.read' | 'session.continue' }
>

export type PairedRuntimeSessionInvocationOptions = {
  userDataPath: string
  timeoutMs: number
  environmentId: string
  channelRef: string
  target: SpoolPublicWorktreeInstance
  operation: SessionOperation
  context: SpoolHostOperationContext
  resolveOwnerHistoricalRecord?: (
    ownerRecordKey: string
  ) => SpoolOwnerHistoricalSessionRecord | null
}

export async function invokePairedRuntimeSession(
  options: PairedRuntimeSessionInvocationOptions
): Promise<unknown> {
  const record = options.resolveOwnerHistoricalRecord?.(options.operation.ownerRecordKey)
  if (!record) {
    throw new SpoolExecutionError(
      options.resolveOwnerHistoricalRecord ? 'resource_not_found' : 'resource_unavailable'
    )
  }
  if (!recordMatchesTarget(record, options.target)) {
    throw new SpoolExecutionError('resource_not_found')
  }
  const params = SpoolPairedRuntimeSessionInvokeParamsSchema.parse({
    target: boundPairedRuntimeTargetSelector(options.target),
    channelRef: options.channelRef,
    operation: { kind: options.operation.kind },
    record: toInternalRecord(record)
  })
  let admitted = false
  try {
    const response = await callRuntimeEnvironmentExistingRoute(
      options.userDataPath,
      options.environmentId,
      'spool.host.invokeSession',
      params,
      options.timeoutMs,
      {
        beforeSend: async () => {
          if (options.context.signal.aborted) {
            throw new SpoolExecutionError('resource_not_found')
          }
          if (options.operation.kind !== 'session.continue') {
            return
          }
          if (!options.context.admissionGuard) {
            throw new SpoolExecutionError('unauthorized')
          }
          await options.context.admissionGuard.beforeSideEffect()
          admitted = true
        }
      }
    )
    options.context.signal.throwIfAborted()
    if (!response.ok) {
      // Why: an older runtime must fail closed instead of reaching a broader session RPC.
      throw new SpoolExecutionError('resource_unavailable')
    }
    const envelope = SpoolPairedRuntimeInvokeResponseSchema.safeParse(response.result)
    if (!envelope.success) {
      throw new SpoolExecutionError(
        options.operation.kind === 'session.continue' && admitted
          ? 'outcome_unknown'
          : 'resource_unavailable'
      )
    }
    if (envelope.data.status === 'error') {
      throw new SpoolExecutionError(envelope.data.code)
    }
    return parseSpoolPairedRuntimeResult(options.operation, envelope.data.result)
  } catch (error) {
    if (error instanceof SpoolExecutionError) {
      throw error
    }
    throw new SpoolExecutionError(
      options.operation.kind === 'session.continue' && admitted
        ? 'outcome_unknown'
        : 'resource_unavailable'
    )
  }
}

function recordMatchesTarget(
  record: SpoolOwnerHistoricalSessionRecord,
  target: SpoolPublicWorktreeInstance
): boolean {
  return (
    record.executionHostId === target.target.executionHostId &&
    record.worktreeInstanceId === target.instanceId &&
    record.spoolIncarnationId === target.spoolIncarnationId
  )
}

function toInternalRecord(
  record: SpoolOwnerHistoricalSessionRecord
): SpoolPairedRuntimeSessionRecord {
  return {
    title: record.title,
    provider: record.provider,
    providerSessionId: record.providerSessionId,
    transcriptPath: record.transcriptPath,
    resumeCommand: record.resumeCommand
  }
}
