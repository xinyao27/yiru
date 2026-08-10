import { randomUUID } from 'node:crypto'

import type {
  CoworkingPairedRuntimeHistoricalSessionPageParams,
  CoworkingPairedRuntimeListLiveSessionsParams,
  CoworkingPairedRuntimeSessionInvokeParams,
  CoworkingPairedRuntimeUnsubscribeSessionChangesParams,
  RuntimeCoworkingSessionInvokeResponse
} from '@yiru/runtime-protocol/contract'
import { CoworkingExecutionError } from '~main/coworking/execution-error'
import type { CoworkingExecutionOperation } from '~shared/coworking/operation-contract'
import {
  CoworkingPairedRuntimeHistoricalSessionPageResponseSchema,
  CoworkingPairedRuntimeLiveSessionsResponseSchema
} from '~shared/coworking/paired-runtime-session-contract'

import type { RpcContext } from '../core'
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
import { coworkingHostSessionChangesCleanupId } from './coworking-host-session-change-subscription'
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

export async function handleCoworkingHostListLiveSessions(
  params: CoworkingPairedRuntimeListLiveSessionsParams,
  context: RpcContext
) {
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

export async function handleCoworkingHostListHistoricalSessionPage(
  params: CoworkingPairedRuntimeHistoricalSessionPageParams,
  context: RpcContext
) {
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
      return CoworkingPairedRuntimeHistoricalSessionPageResponseSchema.parse({
        status: 'ok',
        result: { ...result, nextCursor: boundCursor }
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

export function handleCoworkingHostReleaseHistoricalSessionPage(
  params: CoworkingPairedRuntimeHistoricalSessionPageParams,
  context: RpcContext
) {
  requirePairedRuntimePrincipal(context)
  const binding = coworkingHostSessionPageReleaseBinding(context, params)
  const cursors = getCoworkingHostSessionPageCursors(context.runtime)
  cursors.ensureConnection(context.runtime, binding.physicalConnectionId)
  if (params.cursor === null) {
    // Why: opening cancellation must use the request frozen before any host retarget.
    cursors.releaseOpening(binding)
    return { ok: true as const }
  }
  cursors.releaseOpaque(binding, params.cursor)
  return { ok: true as const }
}

// Why: no longer carries a legacy registration — it is the unary cleanup
// companion of the still-pinned `subscribeSessionChanges` stream (see
// coworking-host-session-methods.ts's own note), and slice 110 gave
// `RpcDispatcher` a fallback into the direct wiring
// (orpc/router-direct/coworking-host.ts) for exactly that shape of
// bare-envelope caller.
export function handleCoworkingHostUnsubscribeSessionChanges(
  params: CoworkingPairedRuntimeUnsubscribeSessionChangesParams,
  context: RpcContext
) {
  requirePairedRuntimePrincipal(context)
  context.runtime.cleanupSubscription(
    coworkingHostSessionChangesCleanupId(context.connectionId, params.requestId)
  )
  return { ok: true as const }
}

export async function handleCoworkingHostInvokeSession(
  params: CoworkingPairedRuntimeSessionInvokeParams,
  context: RpcContext
): Promise<RuntimeCoworkingSessionInvokeResponse> {
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
        // Why: `projectCoworkingHostExecutionResult` returns `unknown` because its
        // result shape varies by `operation.kind` across every coworking invoke leaf —
        // for `session.continue` it parses through `CoworkingSessionContinueHostResultSchema`,
        // which already matches this response's `{ terminalHandle: string }` member.
        result: projectCoworkingHostExecutionResult(operation, result) as { terminalHandle: string }
      }
    } finally {
      // Why: the temporary key is only a local bridge into the existing session executor.
      bundle.sessionRecords.forget(operation.ownerRecordKey)
    }
  } catch (error) {
    return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
  }
}

function remoteSessionOperation(
  kind: 'session.continue'
): Extract<CoworkingExecutionOperation, { kind: 'session.continue' }> {
  return { kind, ownerRecordKey: randomUUID() }
}
