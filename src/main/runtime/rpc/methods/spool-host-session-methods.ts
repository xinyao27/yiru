import { randomUUID } from 'node:crypto'
import {
  SpoolPairedRuntimeHistoricalSessionsResponseSchema,
  SpoolPairedRuntimeListHistoricalSessionsParamsSchema,
  SpoolPairedRuntimeListLiveSessionsParamsSchema,
  SpoolPairedRuntimeLiveSessionsResponseSchema,
  SpoolPairedRuntimeSessionChangedEventSchema,
  SpoolPairedRuntimeSessionInvokeParamsSchema,
  SpoolPairedRuntimeSubscribeSessionChangesParamsSchema,
  SpoolPairedRuntimeUnsubscribeSessionChangesParamsSchema
} from '../../../../shared/spool/spool-paired-runtime-session-contract'
import { parseSpoolPairedRuntimeResult } from '../../../../shared/spool/spool-paired-runtime-result-contract'
import type { SpoolExecutionOperation } from '../../../../shared/spool/spool-operation-contract'
import { SpoolExecutionError } from '../../../spool/spool-execution-error'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod, type RpcContext } from '../core'
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

const SESSION_CHANGED_EVENT = SpoolPairedRuntimeSessionChangedEventSchema.parse({ kind: 'changed' })

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
  defineStreamingMethod({
    name: 'spool.host.subscribeSessionChanges',
    params: SpoolPairedRuntimeSubscribeSessionChangesParamsSchema,
    handler: async (params, context, emit) => {
      requirePairedRuntimePrincipal(context)
      const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
      await runSessionChangesSubscription(context, worktree.worktreeId, emit)
    }
  }),
  defineMethod({
    name: 'spool.host.unsubscribeSessionChanges',
    params: SpoolPairedRuntimeUnsubscribeSessionChangesParamsSchema,
    handler: (params, context) => {
      requirePairedRuntimePrincipal(context)
      context.runtime.cleanupSubscription(
        sessionChangesCleanupId(context.connectionId, params.requestId)
      )
      return { ok: true }
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

async function runSessionChangesSubscription(
  context: RpcContext,
  worktreeId: string,
  emit: (result: unknown) => void
): Promise<void> {
  const signal = context.signal ?? new AbortController().signal
  await new Promise<void>((resolve) => {
    let finished = false
    let unsubscribe = (): void => {}
    const requestId = context.requestId ?? randomUUID()
    const cleanupId = sessionChangesCleanupId(context.connectionId, requestId)
    const finish = (): void => {
      if (finished) {
        return
      }
      finished = true
      signal.removeEventListener('abort', finish)
      context.runtime.cleanupSubscription(cleanupId)
      unsubscribe()
      resolve()
    }
    // Why: logical subscriptions share the owner's physical runtime route and must clean up alone.
    context.runtime.registerSubscriptionCleanup(cleanupId, finish, context.connectionId)
    if (signal.aborted) {
      finish()
      return
    }
    signal.addEventListener('abort', finish, { once: true })
    try {
      unsubscribe = context.runtime.onMobileSessionTabsChanged((snapshot) => {
        if (finished || snapshot.worktree !== worktreeId) {
          return
        }
        try {
          // Why: subscribers only need invalidation; session metadata stays on the owner.
          emit(SESSION_CHANGED_EVENT)
        } catch {
          finish()
        }
      })
    } catch {
      finish()
    }
    if (finished) {
      unsubscribe()
    }
  })
}

function sessionChangesCleanupId(connectionId: string | undefined, requestId: string): string {
  return `spool.host.session-changes:${connectionId ?? 'local'}:${requestId}`
}
