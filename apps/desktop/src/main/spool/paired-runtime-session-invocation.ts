import type { SpoolExecutionOperation } from '../../shared/spool/operation-contract'
import {
  SpoolPairedRuntimeSessionInvokeParamsSchema,
  type SpoolPairedRuntimeSessionRecord
} from '../../shared/spool/paired-runtime-session-contract'
import { callRuntimeEnvironmentExistingRoute } from '../runtime/environment-existing-route'
import { SpoolExecutionError } from './execution-error'
import type { SpoolHostOperationContext } from './execution-gateway'
import { invokeAdmittedPairedRuntimeOperation } from './paired-runtime-admitted-invocation'
import { boundPairedRuntimeTargetSelector } from './paired-runtime-target-binding'
import type { SpoolOwnerHistoricalSessionRecord } from './session-source'
import type { SpoolPublicWorktreeInstance } from './worktree-publication-state'

type SessionOperation = Extract<SpoolExecutionOperation, { kind: 'session.continue' }>

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
  return await invokeAdmittedPairedRuntimeOperation({
    operation: options.operation,
    context: options.context,
    send: (beforeSend) =>
      callRuntimeEnvironmentExistingRoute(
        options.userDataPath,
        options.environmentId,
        'spool.host.invokeSession',
        params,
        options.timeoutMs,
        { beforeSend, signal: options.context.signal }
      )
  })
}

function recordMatchesTarget(
  record: SpoolOwnerHistoricalSessionRecord,
  target: SpoolPublicWorktreeInstance
): boolean {
  return (
    record.executionHostId === target.ownerWorktree.executionHostId &&
    record.actualHostScope === target.actualHostScope &&
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
