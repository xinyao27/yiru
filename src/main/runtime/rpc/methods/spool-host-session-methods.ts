import { randomUUID } from 'node:crypto'
import {
  SpoolPairedRuntimeHistoricalSessionsResponseSchema,
  SpoolPairedRuntimeListHistoricalSessionsParamsSchema,
  SpoolPairedRuntimeListLiveSessionsParamsSchema,
  SpoolPairedRuntimeLiveSessionsResponseSchema,
  SpoolPairedRuntimeSessionInvokeParamsSchema
} from '../../../../shared/spool/spool-paired-runtime-session-contract'
import { parseSpoolPairedRuntimeResult } from '../../../../shared/spool/spool-paired-runtime-result-contract'
import type { SpoolExecutionOperation } from '../../../../shared/spool/spool-operation-contract'
import { SpoolExecutionError } from '../../../spool/spool-execution-error'
import { defineMethod, type RpcAnyMethod } from '../core'
import {
  getHostBundle,
  operationContext,
  pairedRuntimeErrorCode,
  requireActualHostAdapter,
  requirePairedRuntimePrincipal,
  resolveBoundActualHostWorktree,
  resolveIncarnationBoundActualWorktree
} from './spool-host-runtime-authority'
import {
  projectPairedRuntimeHistoricalSessions,
  projectPairedRuntimeLiveSessions
} from './spool-host-session-projection'

export const SPOOL_HOST_SESSION_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'spool.host.listLiveSessions',
    params: SpoolPairedRuntimeListLiveSessionsParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
        const result = await projectPairedRuntimeLiveSessions(context.runtime, worktree)
        return SpoolPairedRuntimeLiveSessionsResponseSchema.parse({ status: 'ok', result })
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  }),
  defineMethod({
    name: 'spool.host.listHistoricalSessions',
    params: SpoolPairedRuntimeListHistoricalSessionsParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
        const result = await projectPairedRuntimeHistoricalSessions(context.runtime, worktree)
        return SpoolPairedRuntimeHistoricalSessionsResponseSchema.parse({ status: 'ok', result })
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  }),
  defineMethod({
    name: 'spool.host.invokeSession',
    params: SpoolPairedRuntimeSessionInvokeParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const target = await resolveBoundActualHostWorktree(context.runtime, params.target)
        const bundle = getHostBundle(context.runtime)
        const operation = remoteSessionOperation(params.operation.kind)
        const remembered = bundle.sessionRecords.rememberResolved({
          ownerRecordKey: operation.ownerRecordKey,
          executionHostId: target.target.executionHostId,
          worktreeInstanceId: target.instanceId,
          spoolIncarnationId: target.spoolIncarnationId,
          ...params.record
        })
        if (!remembered) {
          throw new SpoolExecutionError('invalid_argument')
        }
        try {
          const adapter = requireActualHostAdapter(context.runtime, target)
          const result = await adapter.invoke(
            target,
            operation,
            operationContext(params.channelRef, context, operation.kind === 'session.continue')
          )
          return {
            status: 'ok' as const,
            result: parseSpoolPairedRuntimeResult(operation, result)
          }
        } finally {
          // Why: the temporary key is only a local bridge into the existing session executor.
          bundle.sessionRecords.forget(operation.ownerRecordKey)
        }
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  })
]

function remoteSessionOperation(
  kind: 'session.read' | 'session.continue'
): Extract<SpoolExecutionOperation, { kind: 'session.read' | 'session.continue' }> {
  return { kind, ownerRecordKey: randomUUID() }
}
