import type {
  CoworkingPairedRuntimeCanonicalizeParams,
  CoworkingPairedRuntimeInspectParams,
  CoworkingPairedRuntimeInvokeParams,
  CoworkingPairedRuntimeReleaseChannelParams,
  CoworkingPairedRuntimeRevokeWorktreeParams,
  CoworkingPairedRuntimeSubscribeParams,
  CoworkingPairedRuntimeWorktreeCatalogParams,
  RuntimeCoworkingExecutionResult,
  RuntimeCoworkingTerminalEvent,
  RuntimeCoworkingWorktreeCatalog
} from '@yiru/runtime-protocol/contract'
import type { CoworkingHostSubscription } from '~main/coworking/execution-gateway'
import { isCoworkingMutationOperation } from '~shared/coworking/operation-contract'
import {
  CoworkingPairedRuntimeCanonicalizeResultSchema,
  CoworkingPairedRuntimeInspectionSchema,
  CoworkingPairedRuntimeTerminalEventSchema,
  CoworkingPairedRuntimeWorktreeCatalogSchema
} from '~shared/coworking/paired-runtime-result-contract'

import type { RpcAnyMethod, RpcContext } from '../core'
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

export async function handleCoworkingHostListWorktrees(
  params: CoworkingPairedRuntimeWorktreeCatalogParams,
  context: RpcContext
): Promise<RuntimeCoworkingWorktreeCatalog> {
  requirePairedRuntimePrincipal(context)
  const actualHostScope = resolvePairedRuntimeRepoActualHostScope(context.runtime, params.repoId)
  const inventory = await context.runtime.listDetectedManagedWorktrees(`id:${params.repoId}`)
  // Why: the wire schema validates only the envelope shape (`inventory: z.unknown()`)
  // so a large worktree catalog isn't walked twice — `listDetectedManagedWorktrees`
  // already produces the shape the contract declares.
  return CoworkingPairedRuntimeWorktreeCatalogSchema.parse({
    actualHostScope,
    inventory
  }) as RuntimeCoworkingWorktreeCatalog
}

export async function handleCoworkingHostInspectWorktree(
  params: CoworkingPairedRuntimeInspectParams,
  context: RpcContext
) {
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
      status: 'unavailable' as const,
      reason: isInvalidPairedRuntimeTarget(error)
        ? ('invalid-host-response' as const)
        : ('host-unavailable' as const)
    }
  }
}

export async function handleCoworkingHostCanonicalizePath(
  params: CoworkingPairedRuntimeCanonicalizeParams,
  context: RpcContext
) {
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

export async function handleCoworkingHostInvoke(
  params: CoworkingPairedRuntimeInvokeParams,
  context: RpcContext
) {
  requirePairedRuntimePrincipal(context)
  const operation = params.operation
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
      // Why: `projectCoworkingHostExecutionResult` dispatches on `operation.kind` and
      // returns `unknown` because its result shape varies per operation — the schema it
      // parses through already matches the contract's per-member shape for every
      // `CoworkingExecutionOperation` this invoke leaf can receive.
      result: projectCoworkingHostExecutionResult(
        operation,
        result
      ) as RuntimeCoworkingExecutionResult
    }
  } catch (error) {
    return { status: 'error' as const, code: pairedRuntimeErrorCode(error) }
  }
}

export function handleCoworkingHostReleaseChannel(
  params: CoworkingPairedRuntimeReleaseChannelParams,
  context: RpcContext
) {
  requirePairedRuntimePrincipal(context)
  getCoworkingHostChannelLifetimes(context.runtime).release(
    context,
    params.channelRef,
    (channelRef) => getHostBundle(context.runtime).adapter.closeConnection(channelRef)
  )
  return { ok: true as const }
}

export function handleCoworkingHostRevokeWorktree(
  params: CoworkingPairedRuntimeRevokeWorktreeParams,
  context: RpcContext
) {
  requirePairedRuntimePrincipal(context)
  getHostBundle(context.runtime).adapter.revokeWorktree(params.channelRef, params.instanceId)
  return { ok: true as const }
}

// Why: kept as a plain streaming handler (not inline in a legacy
// registration) — reached only through `orpc/router-direct/coworking-host.ts`'s
// direct wiring and, for its bare-envelope caller
// (`main/coworking/paired-runtime/host-adapter.ts`'s `subscribe()`, via
// `subscribeRuntimeEnvironmentExistingRoute` with no oRPC negotiation),
// slice 112's streaming fallback (legacy-dispatch-fallback.ts's
// `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`), which retired this
// leaf's legacy registration — see COWORKING_HOST_METHODS's own note below.
export async function handleCoworkingHostSubscribeTerminal(
  params: CoworkingPairedRuntimeSubscribeParams,
  context: RpcContext,
  emit: (event: RuntimeCoworkingTerminalEvent) => void
): Promise<void> {
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

// Why: Phase 6 D-stage full retirement (docs/runtime-orpc-migration.md) —
// listWorktrees/inspectWorktree/canonicalizePath/invoke/releaseChannel/
// revokeWorktree moved to direct contract wiring (orpc/router-direct/
// coworking-host.ts), reusing these same handler exports. subscribeTerminal
// kept a legacy registration through 切片 81 because its only caller
// (main/coworking/paired-runtime/host-adapter.ts's `subscribe()`) reaches it
// through `subscribeRuntimeEnvironmentExistingRoute` — a bare-method-name
// shared-control subscribe with no oRPC-capability negotiation, main-process
// to main-process, the same hazard pattern that pinned `terminal`/`session`/
// `runtime`'s own streaming leaves. Slice 112 gave `RpcDispatcher` a
// streaming fallback into the same direct wiring for exactly that shape of
// caller, so this dropped too — the direct wiring alone (below, still
// required because a directly-wired domain must supply every procedure under
// its top-level contract key or the omitted ones vanish from the router
// entirely — see router-direct.ts's own note) now serves both the real oRPC
// path and the bare-envelope caller.
export const COWORKING_HOST_METHODS: RpcAnyMethod[] = [...COWORKING_HOST_SESSION_METHODS]

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
  emit: (result: RuntimeCoworkingTerminalEvent) => void
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
