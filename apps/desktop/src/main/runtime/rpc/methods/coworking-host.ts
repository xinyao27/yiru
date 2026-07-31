import type { CoworkingHostSubscription } from '~main/coworking/execution-gateway'
import { isCoworkingMutationOperation } from '~shared/coworking/operation-contract'
import {
  CoworkingPairedRuntimeCanonicalizeParamsSchema,
  CoworkingPairedRuntimeInspectParamsSchema,
  CoworkingPairedRuntimeInvokeParamsSchema,
  CoworkingPairedRuntimeReleaseChannelParamsSchema,
  CoworkingPairedRuntimeRevokeWorktreeParamsSchema,
  CoworkingPairedRuntimeSubscribeParamsSchema,
  CoworkingPairedRuntimeWorktreeCatalogParamsSchema,
  parseCoworkingPairedRuntimeOperation
} from '~shared/coworking/paired-runtime-host-contract'
import {
  CoworkingPairedRuntimeCanonicalizeResultSchema,
  CoworkingPairedRuntimeInspectionSchema,
  CoworkingPairedRuntimeTerminalEventSchema,
  CoworkingPairedRuntimeWorktreeCatalogSchema
} from '~shared/coworking/paired-runtime-result-contract'

import { defineMethod, defineStreamingMethod, type RpcAnyMethod, type RpcContext } from '../core'
import { getCoworkingHostChannelLifetimes } from './coworking-host-channel-lifetimes'
import { projectCoworkingHostExecutionResult } from './coworking-host-result-projection'
import {
  createIncarnationHost,
  getHostBundle,
  operationContext,
  pairedRuntimeErrorCode,
  requireActualHostAdapter,
  requirePairedRuntimePrincipal,
  resolvePairedRuntimeRepoActualHostScope,
  resolveActualHostWorktree,
  resolveBoundActualHostWorktree,
  toOwnerWorktree
} from './coworking-host-runtime-authority'
import { COWORKING_HOST_SESSION_METHODS } from './coworking-host-session-methods'

export const COWORKING_HOST_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'coworking.host.listWorktrees',
    params: CoworkingPairedRuntimeWorktreeCatalogParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      const actualHostScope = resolvePairedRuntimeRepoActualHostScope(
        context.runtime,
        params.repoId
      )
      const inventory = await context.runtime.listDetectedManagedWorktrees(`id:${params.repoId}`)
      return CoworkingPairedRuntimeWorktreeCatalogSchema.parse({ actualHostScope, inventory })
    }
  }),
  defineMethod({
    name: 'coworking.host.inspectWorktree',
    params: CoworkingPairedRuntimeInspectParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const resolved = await resolveActualHostWorktree(context.runtime, params.target)
        const result = await createIncarnationHost(resolved).inspect(
          toOwnerWorktree(resolved),
          params.mode
        )
        return CoworkingPairedRuntimeInspectionSchema.parse(result)
      } catch (error) {
        return {
          status: 'unavailable',
          reason: isInvalidPairedRuntimeTarget(error)
            ? ('invalid-host-response' as const)
            : ('host-unavailable' as const)
        }
      }
    }
  }),
  defineMethod({
    name: 'coworking.host.canonicalizePath',
    params: CoworkingPairedRuntimeCanonicalizeParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const resolved = await resolveActualHostWorktree(context.runtime, params.target)
        const result = await createIncarnationHost(resolved).canonicalizePath(
          toOwnerWorktree(resolved),
          params.path
        )
        return CoworkingPairedRuntimeCanonicalizeResultSchema.parse(result)
      } catch (error) {
        return isInvalidPairedRuntimeTarget(error)
          ? { status: 'invalid' as const }
          : { status: 'unavailable' as const }
      }
    }
  }),
  defineMethod({
    name: 'coworking.host.invoke',
    params: CoworkingPairedRuntimeInvokeParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      const operation = parseCoworkingPairedRuntimeOperation(params.operation)
      try {
        const target = await resolveBoundActualHostWorktree(context.runtime, params.target)
        const adapter = requireActualHostAdapter(context.runtime, target)
        getCoworkingHostChannelLifetimes(context.runtime).ensure(
          context,
          params.channelRef,
          (channelRef) => getHostBundle(context.runtime).adapter.closeConnection(channelRef)
        )
        const result = await adapter.invoke(
          target,
          operation,
          operationContext(params.channelRef, context, isCoworkingMutationOperation(operation))
        )
        return {
          status: 'ok' as const,
          result: projectCoworkingHostExecutionResult(operation, result)
        }
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  }),
  defineStreamingMethod({
    name: 'coworking.host.subscribeTerminal',
    params: CoworkingPairedRuntimeSubscribeParamsSchema,
    handler: async (params, context, emit) => {
      requirePairedRuntimePrincipal(context)
      const target = await resolveBoundActualHostWorktree(context.runtime, params.target)
      const adapter = requireActualHostAdapter(context.runtime, target)
      getCoworkingHostChannelLifetimes(context.runtime).ensure(
        context,
        params.channelRef,
        (channelRef) => getHostBundle(context.runtime).adapter.closeConnection(channelRef)
      )
      try {
        await runTerminalSubscription(
          context,
          (emitEvent) =>
            adapter.subscribe(
              target,
              params.operation,
              operationContext(params.channelRef, context, false),
              emitEvent
            ),
          emit
        )
      } finally {
        // Why: the streaming socket is the crash-safe lifetime anchor for remote viewport claims.
        adapter.revokeWorktree?.(params.channelRef, target.instanceId)
      }
    }
  }),
  defineMethod({
    name: 'coworking.host.releaseChannel',
    params: CoworkingPairedRuntimeReleaseChannelParamsSchema,
    handler: (params, context) => {
      requirePairedRuntimePrincipal(context)
      getCoworkingHostChannelLifetimes(context.runtime).release(
        context,
        params.channelRef,
        (channelRef) => getHostBundle(context.runtime).adapter.closeConnection(channelRef)
      )
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'coworking.host.revokeWorktree',
    params: CoworkingPairedRuntimeRevokeWorktreeParamsSchema,
    handler: (params, context) => {
      requirePairedRuntimePrincipal(context)
      getHostBundle(context.runtime).adapter.revokeWorktree(params.channelRef, params.instanceId)
      return { ok: true }
    }
  }),
  ...COWORKING_HOST_SESSION_METHODS
]

function isInvalidPairedRuntimeTarget(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return (
    message === 'selector_not_found' ||
    message === 'recursive_runtime_host' ||
    message === 'worktree_host_mismatch'
  )
}

async function runTerminalSubscription(
  context: RpcContext,
  subscribe: (emit: (event: unknown) => void) => CoworkingHostSubscription,
  emit: (result: unknown) => void
): Promise<void> {
  const signal = context.signal ?? new AbortController().signal
  await new Promise<void>((resolve) => {
    let finished = false
    let subscription: CoworkingHostSubscription | null = null
    const cleanupId = context.requestId ? `coworking.host.terminal:${context.requestId}` : null
    const finish = (): void => {
      if (finished) {
        return
      }
      finished = true
      signal.removeEventListener('abort', finish)
      if (cleanupId) {
        context.runtime.cleanupSubscription(cleanupId)
      }
      subscription?.close()
      resolve()
    }
    const emitEvent = (event: unknown): void => {
      const parsed = CoworkingPairedRuntimeTerminalEventSchema.safeParse(event)
      if (!parsed.success) {
        finish()
        return
      }
      emit(parsed.data)
      if (parsed.data.kind === 'closed') {
        finish()
      }
    }
    if (cleanupId) {
      // Why: a borrowed shared socket needs logical cleanup without closing the owner's route.
      context.runtime.registerSubscriptionCleanup(cleanupId, finish, context.connectionId)
    }
    if (signal.aborted) {
      finish()
      return
    }
    signal.addEventListener('abort', finish, { once: true })
    try {
      const created = subscribe(emitEvent)
      subscription = created
      if (finished) {
        created.close()
      }
    } catch {
      finish()
    }
  })
}
