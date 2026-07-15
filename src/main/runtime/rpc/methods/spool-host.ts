import {
  SpoolPairedRuntimeCanonicalizeParamsSchema,
  SpoolPairedRuntimeInspectParamsSchema,
  SpoolPairedRuntimeInvokeParamsSchema,
  SpoolPairedRuntimeReleaseChannelParamsSchema,
  SpoolPairedRuntimeRevokeWorktreeParamsSchema,
  SpoolPairedRuntimeSubscribeParamsSchema,
  SpoolPairedRuntimeWorktreeCatalogParamsSchema,
  parseSpoolPairedRuntimeOperation
} from '../../../../shared/spool/spool-paired-runtime-host-contract'
import {
  SpoolPairedRuntimeCanonicalizeResultSchema,
  SpoolPairedRuntimeInspectionSchema,
  SpoolPairedRuntimeTerminalEventSchema,
  SpoolPairedRuntimeWorktreeCatalogSchema,
  parseSpoolPairedRuntimeResult
} from '../../../../shared/spool/spool-paired-runtime-result-contract'
import { isSpoolMutationOperation } from '../../../../shared/spool/spool-operation-contract'
import type { SpoolHostSubscription } from '../../../spool/spool-execution-gateway'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod, type RpcContext } from '../core'
import { SPOOL_HOST_SESSION_METHODS } from './spool-host-session-methods'
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
} from './spool-host-runtime-authority'

export const SPOOL_HOST_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'spool.host.listWorktrees',
    params: SpoolPairedRuntimeWorktreeCatalogParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      const actualHostScope = resolvePairedRuntimeRepoActualHostScope(
        context.runtime,
        params.repoId
      )
      const inventory = await context.runtime.listDetectedManagedWorktrees(`id:${params.repoId}`)
      return SpoolPairedRuntimeWorktreeCatalogSchema.parse({ actualHostScope, inventory })
    }
  }),
  defineMethod({
    name: 'spool.host.inspectWorktree',
    params: SpoolPairedRuntimeInspectParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const resolved = await resolveActualHostWorktree(context.runtime, params.target)
        const result = await createIncarnationHost(resolved).inspect(
          toOwnerWorktree(resolved),
          params.mode
        )
        return SpoolPairedRuntimeInspectionSchema.parse(result)
      } catch {
        return { status: 'unavailable', reason: 'host-unavailable' as const }
      }
    }
  }),
  defineMethod({
    name: 'spool.host.canonicalizePath',
    params: SpoolPairedRuntimeCanonicalizeParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      try {
        const resolved = await resolveActualHostWorktree(context.runtime, params.target)
        const result = await createIncarnationHost(resolved).canonicalizePath(
          toOwnerWorktree(resolved),
          params.path
        )
        return SpoolPairedRuntimeCanonicalizeResultSchema.parse(result)
      } catch {
        return { status: 'unavailable' as const }
      }
    }
  }),
  defineMethod({
    name: 'spool.host.invoke',
    params: SpoolPairedRuntimeInvokeParamsSchema,
    handler: async (params, context) => {
      requirePairedRuntimePrincipal(context)
      const operation = parseSpoolPairedRuntimeOperation(params.operation)
      try {
        const target = await resolveBoundActualHostWorktree(context.runtime, params.target)
        const adapter = requireActualHostAdapter(context.runtime, target)
        const result = await adapter.invoke(
          target,
          operation,
          operationContext(params.channelRef, context, isSpoolMutationOperation(operation))
        )
        return { status: 'ok' as const, result: parseSpoolPairedRuntimeResult(operation, result) }
      } catch (error) {
        return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
      }
    }
  }),
  defineStreamingMethod({
    name: 'spool.host.subscribeTerminal',
    params: SpoolPairedRuntimeSubscribeParamsSchema,
    handler: async (params, context, emit) => {
      requirePairedRuntimePrincipal(context)
      const target = await resolveBoundActualHostWorktree(context.runtime, params.target)
      const adapter = requireActualHostAdapter(context.runtime, target)
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
    name: 'spool.host.releaseChannel',
    params: SpoolPairedRuntimeReleaseChannelParamsSchema,
    handler: (params, context) => {
      requirePairedRuntimePrincipal(context)
      getHostBundle(context.runtime).adapter.closeConnection(params.channelRef)
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'spool.host.revokeWorktree',
    params: SpoolPairedRuntimeRevokeWorktreeParamsSchema,
    handler: (params, context) => {
      requirePairedRuntimePrincipal(context)
      getHostBundle(context.runtime).adapter.revokeWorktree(params.channelRef, params.instanceId)
      return { ok: true }
    }
  }),
  ...SPOOL_HOST_SESSION_METHODS
]

async function runTerminalSubscription(
  context: RpcContext,
  subscribe: (emit: (event: unknown) => void) => SpoolHostSubscription,
  emit: (result: unknown) => void
): Promise<void> {
  const signal = context.signal ?? new AbortController().signal
  await new Promise<void>((resolve) => {
    let finished = false
    let subscription: SpoolHostSubscription | null = null
    const cleanupId = context.requestId ? `spool.host.terminal:${context.requestId}` : null
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
      const parsed = SpoolPairedRuntimeTerminalEventSchema.safeParse(event)
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
