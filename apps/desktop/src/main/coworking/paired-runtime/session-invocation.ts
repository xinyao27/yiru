import { callRuntimeEnvironmentExistingRoute } from '~main/runtime/environment-existing-route'
import type { CoworkingExecutionOperation } from '~shared/coworking/operation-contract'
import {
  CoworkingPairedRuntimeSessionInvokeParamsSchema,
  type CoworkingPairedRuntimeSessionRecord
} from '~shared/coworking/paired-runtime-session-contract'

import { CoworkingExecutionError } from '../execution-error'
import type { CoworkingHostOperationContext } from '../execution-gateway'
import type { CoworkingOwnerHistoricalSessionRecord } from '../session/source'
import type { CoworkingPublicWorktreeInstance } from '../worktree-publication-state'
import { invokeAdmittedPairedRuntimeOperation } from './admitted-invocation'
import { boundPairedRuntimeTargetSelector } from './target-binding'

type SessionOperation = Extract<CoworkingExecutionOperation, { kind: 'session.continue' }>

export type PairedRuntimeSessionInvocationOptions = {
  userDataPath: string
  timeoutMs: number
  environmentId: string
  channelRef: string
  target: CoworkingPublicWorktreeInstance
  operation: SessionOperation
  context: CoworkingHostOperationContext
  resolveOwnerHistoricalRecord?: (
    ownerRecordKey: string
  ) => CoworkingOwnerHistoricalSessionRecord | null
}

export async function invokePairedRuntimeSession(
  options: PairedRuntimeSessionInvocationOptions
): Promise<unknown> {
  const record = options.resolveOwnerHistoricalRecord?.(options.operation.ownerRecordKey)
  if (!record) {
    throw new CoworkingExecutionError(
      options.resolveOwnerHistoricalRecord ? 'resource_not_found' : 'resource_unavailable'
    )
  }
  if (!recordMatchesTarget(record, options.target)) {
    throw new CoworkingExecutionError('resource_not_found')
  }
  const params = CoworkingPairedRuntimeSessionInvokeParamsSchema.parse({
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
        'coworking.host.invokeSession',
        params,
        options.timeoutMs,
        { beforeSend, signal: options.context.signal }
      )
  })
}

function recordMatchesTarget(
  record: CoworkingOwnerHistoricalSessionRecord,
  target: CoworkingPublicWorktreeInstance
): boolean {
  return (
    record.executionHostId === target.ownerWorktree.executionHostId &&
    record.actualHostScope === target.actualHostScope &&
    record.worktreeInstanceId === target.instanceId &&
    record.coworkingIncarnationId === target.coworkingIncarnationId
  )
}

function toInternalRecord(
  record: CoworkingOwnerHistoricalSessionRecord
): CoworkingPairedRuntimeSessionRecord {
  return {
    title: record.title,
    provider: record.provider,
    providerSessionId: record.providerSessionId,
    transcriptPath: record.transcriptPath,
    resumeCommand: record.resumeCommand
  }
}
