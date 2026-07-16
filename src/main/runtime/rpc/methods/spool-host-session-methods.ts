import { randomUUID } from 'node:crypto'
import {
  SpoolPairedRuntimeHistoricalSessionPageResponseSchema,
  SpoolPairedRuntimeListHistoricalSessionPageParamsSchema,
  SpoolPairedRuntimeListLiveSessionsParamsSchema,
  SpoolPairedRuntimeLiveSessionsResponseSchema,
  SpoolPairedRuntimeReleaseHistoricalSessionPageParamsSchema,
  SpoolPairedRuntimeSessionInvokeParamsSchema,
  SpoolPairedRuntimeSubscribeSessionChangesParamsSchema,
  SpoolPairedRuntimeUnsubscribeSessionChangesParamsSchema
} from '../../../../shared/spool/spool-paired-runtime-session-contract'
import type { SpoolExecutionOperation } from '../../../../shared/spool/spool-operation-contract'
import { SpoolExecutionError } from '../../../spool/spool-execution-error'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
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
  pairedRuntimeHistoricalSessionReadRequest,
  projectPairedRuntimeHistoricalSessionPage,
  projectPairedRuntimeLiveSessions
} from './spool-host-session-projection'
import { getSpoolHostSessionPageCursors } from './spool-host-session-page-cursor-registry'
import {
  spoolHostSessionPageBinding,
  spoolHostSessionPageReleaseBinding
} from './spool-host-session-page-binding'
import { getSpoolHostChannelLifetimes } from './spool-host-channel-lifetimes'
import { projectSpoolHostExecutionResult } from './spool-host-result-projection'
import {
  runSpoolHostSessionChangesSubscription,
  spoolHostSessionChangesCleanupId
} from './spool-host-session-change-subscription'

export const SPOOL_HOST_SESSION_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'spool.host.listLiveSessions',
    params: SpoolPairedRuntimeListLiveSessionsParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
        const sessionBindings = getHostBundle(context.runtime).terminalSessionBindings
        const result = await projectPairedRuntimeLiveSessions(
          context.runtime,
          sessionBindings,
          { ...worktree, spoolIncarnationId: params.target.spoolIncarnationId },
          context.signal
        )
        return SpoolPairedRuntimeLiveSessionsResponseSchema.parse({ status: 'ok', result })
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  }),
  defineMethod({
    name: 'spool.host.listHistoricalSessionPage',
    params: SpoolPairedRuntimeListHistoricalSessionPageParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
        context.signal?.throwIfAborted()
        const binding = spoolHostSessionPageBinding(context, params, worktree)
        const cursors = getSpoolHostSessionPageCursors(context.runtime)
        cursors.ensureConnection(context.runtime, binding.physicalConnectionId)
        const resolvedCursor = cursors.resolve(binding, params.cursor)
        const reader = getHostBundle(context.runtime).sessionReader
        const innerRequest = pairedRuntimeHistoricalSessionReadRequest(
          worktree,
          params.target.spoolIncarnationId,
          params.purpose,
          params.inventoryScope
        )
        const opening =
          params.cursor === null
            ? cursors.beginOpening(binding, async () => {
                await reader.releaseAiVaultSessionPage(innerRequest, null)
              })
            : null
        let releaseCursor = resolvedCursor.innerCursor
        let boundCursor: string | null = null
        try {
          const result = await projectPairedRuntimeHistoricalSessionPage(
            reader,
            worktree,
            params.target.spoolIncarnationId,
            params.purpose,
            params.inventoryScope,
            resolvedCursor.innerCursor,
            context.signal
          )
          releaseCursor = result.nextCursor
          // Why: cancellation can win after the inner page minted its cursor; take cleanup
          // ownership before observing abort so the frozen inventory cannot leak to its TTL.
          context.signal?.throwIfAborted()
          boundCursor = cursors.bind(
            binding,
            resolvedCursor,
            result.nextCursor,
            async (cursor) => await reader.releaseAiVaultSessionPage(innerRequest, cursor)
          )
          const page = {
            ...result,
            nextCursor: boundCursor
          }
          return SpoolPairedRuntimeHistoricalSessionPageResponseSchema.parse({
            status: 'ok',
            result: page
          })
        } catch (error) {
          // Why: a failed page cannot be resumed safely and must not consume chain capacity.
          let cursorToRelease = resolvedCursor
          if (boundCursor) {
            try {
              cursorToRelease = cursors.resolve(binding, boundCursor)
            } catch {
              // A disconnect cleanup may already have removed the newly bound alias.
            }
          }
          cursors.release(binding, cursorToRelease, false)
          try {
            await reader.releaseAiVaultSessionPage(innerRequest, releaseCursor)
          } catch {
            // Preserve the page failure; the inner store also reclaims abandoned cursors by TTL.
          }
          throw error
        } finally {
          if (opening) {
            cursors.finishOpening(opening)
          }
        }
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  }),
  defineMethod({
    name: 'spool.host.releaseHistoricalSessionPage',
    params: SpoolPairedRuntimeReleaseHistoricalSessionPageParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      const binding = spoolHostSessionPageReleaseBinding(context, params)
      const cursors = getSpoolHostSessionPageCursors(context.runtime)
      cursors.ensureConnection(context.runtime, binding.physicalConnectionId)
      if (params.cursor === null) {
        // Why: opening cancellation must use the request frozen before any host retarget.
        cursors.releaseOpening(binding)
        return { ok: true }
      }
      cursors.releaseOpaque(binding, params.cursor)
      return { ok: true }
    }
  }),
  defineStreamingMethod({
    name: 'spool.host.subscribeSessionChanges',
    params: SpoolPairedRuntimeSubscribeSessionChangesParamsSchema,
    handler: async (params, context, emit) => {
      requirePairedRuntimePrincipal(context)
      const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
      await runSpoolHostSessionChangesSubscription(
        context,
        { ...worktree, spoolIncarnationId: params.target.spoolIncarnationId },
        getHostBundle(context.runtime).terminalSessionBindings,
        emit
      )
    }
  }),
  defineMethod({
    name: 'spool.host.unsubscribeSessionChanges',
    params: SpoolPairedRuntimeUnsubscribeSessionChangesParamsSchema,
    handler: (params, context) => {
      requirePairedRuntimePrincipal(context)
      context.runtime.cleanupSubscription(
        spoolHostSessionChangesCleanupId(context.connectionId, params.requestId)
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
          executionHostId: target.ownerWorktree.executionHostId,
          actualHostScope: target.actualHostScope,
          worktreeInstanceId: target.instanceId,
          spoolIncarnationId: target.spoolIncarnationId,
          ...params.record
        })
        if (!remembered) {
          throw new SpoolExecutionError('invalid_argument')
        }
        try {
          const adapter = requireActualHostAdapter(context.runtime, target)
          getSpoolHostChannelLifetimes(context.runtime).ensure(
            context,
            params.channelRef,
            (channelRef) => getHostBundle(context.runtime).adapter.closeConnection(channelRef)
          )
          const result = await adapter.invoke(
            target,
            operation,
            operationContext(params.channelRef, context, operation.kind === 'session.continue')
          )
          return {
            status: 'ok' as const,
            result: projectSpoolHostExecutionResult(operation, result)
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
  kind: 'session.continue'
): Extract<SpoolExecutionOperation, { kind: 'session.continue' }> {
  return { kind, ownerRecordKey: randomUUID() }
}
