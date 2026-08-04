import { randomUUID } from 'node:crypto'

import { CoworkingExecutionError } from '~main/coworking/execution-error'
import type { CoworkingExecutionOperation } from '~shared/coworking/operation-contract'
import {
  CoworkingPairedRuntimeHistoricalSessionPageResponseSchema,
  CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema,
  CoworkingPairedRuntimeListLiveSessionsParamsSchema,
  CoworkingPairedRuntimeLiveSessionsResponseSchema,
  CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema,
  CoworkingPairedRuntimeSessionInvokeParamsSchema,
  CoworkingPairedRuntimeSubscribeSessionChangesParamsSchema,
  CoworkingPairedRuntimeUnsubscribeSessionChangesParamsSchema
} from '~shared/coworking/paired-runtime-session-contract'

import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import { getCoworkingHostChannelLifetimes } from './coworking-host-channel-lifetimes'
import { projectCoworkingHostExecutionResult } from './coworking-host-result-projection'
import {
  getHostBundle,
  operationContext,
  pairedRuntimeErrorCode,
  requireActualHostAdapter,
  requirePairedRuntimePrincipal,
  resolveBoundActualHostWorktree,
  resolveIncarnationBoundActualWorktree
} from './coworking-host-runtime-authority'
import {
  runCoworkingHostSessionChangesSubscription,
  coworkingHostSessionChangesCleanupId
} from './coworking-host-session-change-subscription'
import {
  coworkingHostSessionPageBinding,
  coworkingHostSessionPageReleaseBinding
} from './coworking-host-session-page-binding'
import { getCoworkingHostSessionPageCursors } from './coworking-host-session-page-cursor-registry'
import {
  pairedRuntimeHistoricalSessionReadRequest,
  projectPairedRuntimeHistoricalSessionPage,
  projectPairedRuntimeLiveSessions
} from './coworking-host-session-projection'

export const COWORKING_HOST_SESSION_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'coworking.host.listLiveSessions',
    params: CoworkingPairedRuntimeListLiveSessionsParamsSchema,
    access: { scope: 'worktree', tier: 'read', principals: ['runtime'] },
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
        const sessionBindings = getHostBundle(context.runtime).terminalSessionBindings
        const result = await projectPairedRuntimeLiveSessions(
          context.runtime,
          sessionBindings,
          { ...worktree, coworkingIncarnationId: params.target.coworkingIncarnationId },
          context.signal
        )
        return CoworkingPairedRuntimeLiveSessionsResponseSchema.parse({ status: 'ok', result })
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  }),
  defineMethod({
    name: 'coworking.host.listHistoricalSessionPage',
    params: CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema,
    access: { scope: 'worktree', tier: 'read', principals: ['runtime'] },
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
        context.signal?.throwIfAborted()
        const binding = coworkingHostSessionPageBinding(context, params, worktree)
        const cursors = getCoworkingHostSessionPageCursors(context.runtime)
        cursors.ensureConnection(context.runtime, binding.physicalConnectionId)
        const resolvedCursor = cursors.resolve(binding, params.cursor)
        const reader = getHostBundle(context.runtime).sessionReader
        const innerRequest = pairedRuntimeHistoricalSessionReadRequest(
          worktree,
          params.target.coworkingIncarnationId,
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
            params.target.coworkingIncarnationId,
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
          return CoworkingPairedRuntimeHistoricalSessionPageResponseSchema.parse({
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
    name: 'coworking.host.releaseHistoricalSessionPage',
    params: CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema,
    access: { scope: 'worktree', tier: 'read', principals: ['runtime'] },
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      const binding = coworkingHostSessionPageReleaseBinding(context, params)
      const cursors = getCoworkingHostSessionPageCursors(context.runtime)
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
    name: 'coworking.host.subscribeSessionChanges',
    params: CoworkingPairedRuntimeSubscribeSessionChangesParamsSchema,
    access: { scope: 'worktree', tier: 'read', principals: ['runtime'] },
    handler: async (params, context, emit) => {
      requirePairedRuntimePrincipal(context)
      const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
      await runCoworkingHostSessionChangesSubscription(
        context,
        { ...worktree, coworkingIncarnationId: params.target.coworkingIncarnationId },
        getHostBundle(context.runtime).terminalSessionBindings,
        emit
      )
    }
  }),
  defineMethod({
    name: 'coworking.host.unsubscribeSessionChanges',
    params: CoworkingPairedRuntimeUnsubscribeSessionChangesParamsSchema,
    access: { scope: 'worktree', tier: 'read', principals: ['runtime'] },
    handler: (params, context) => {
      requirePairedRuntimePrincipal(context)
      context.runtime.cleanupSubscription(
        coworkingHostSessionChangesCleanupId(context.connectionId, params.requestId)
      )
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'coworking.host.invokeSession',
    params: CoworkingPairedRuntimeSessionInvokeParamsSchema,
    access: { scope: 'worktree', tier: 'control', principals: ['runtime'] },
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
          coworkingIncarnationId: target.coworkingIncarnationId,
          ...params.record
        })
        if (!remembered) {
          throw new CoworkingExecutionError('invalid_argument')
        }
        try {
          const adapter = requireActualHostAdapter(context.runtime, target)
          getCoworkingHostChannelLifetimes(context.runtime).ensure(
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
            result: projectCoworkingHostExecutionResult(operation, result)
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
): Extract<CoworkingExecutionOperation, { kind: 'session.continue' }> {
  return { kind, ownerRecordKey: randomUUID() }
}
