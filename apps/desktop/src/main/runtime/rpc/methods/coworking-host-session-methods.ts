import type {
  CoworkingPairedRuntimeSubscribeSessionChangesParams,
  RuntimeCoworkingSessionChangedEvent
} from '@yiru/runtime-protocol/contract'

import type { RpcAnyMethod, RpcContext } from '../core'
import {
  getHostBundle,
  requirePairedRuntimePrincipal,
  resolveIncarnationBoundActualWorktree
} from './coworking-host-runtime-authority'
import { runCoworkingHostSessionChangesSubscription } from './coworking-host-session-change-subscription'

// Why: kept as a plain streaming handler (not inline in a legacy
// registration) — reached only through `orpc/router-direct/coworking-host.ts`'s
// direct wiring and, for its bare-envelope caller
// (`main/coworking/paired-runtime/session-change-subscriptions.ts`, via
// `subscribeRuntimeEnvironmentRetainedExistingRoute` with no oRPC
// negotiation), slice 112's streaming fallback (legacy-dispatch-fallback.ts's
// `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`) — see
// COWORKING_HOST_SESSION_METHODS's own note below for this leaf's history.
export async function handleCoworkingHostSubscribeSessionChanges(
  params: CoworkingPairedRuntimeSubscribeSessionChangesParams,
  context: RpcContext,
  emit: (event: RuntimeCoworkingSessionChangedEvent) => void
): Promise<void> {
  requirePairedRuntimePrincipal(context)
  const worktree = await resolveIncarnationBoundActualWorktree(context.runtime, params.target)
  await runCoworkingHostSessionChangesSubscription(
    context,
    { ...worktree, coworkingIncarnationId: params.target.coworkingIncarnationId },
    getHostBundle(context.runtime).terminalSessionBindings,
    emit
  )
}

// Why: Phase 6 D-stage full retirement (docs/runtime-orpc-migration.md) —
// listLiveSessions/listHistoricalSessionPage/releaseHistoricalSessionPage/
// invokeSession moved to direct contract wiring (orpc/router-direct/
// coworking-host.ts). subscribeSessionChanges kept a legacy registration
// through 切片 81 because its only caller
// (main/coworking/paired-runtime/session-change-subscriptions.ts) uses
// `subscribeRuntimeEnvironmentRetainedExistingRoute` (bare-method-name
// shared-control subscribe, no oRPC negotiation) — streaming, so outside
// slice 110's unary-only dispatcher-fallback scope, same pattern as
// `session.tabs.subscribe`'s history in session-tabs.ts. Its cleanup
// companion, `unsubscribeSessionChanges` — sent by
// shared/remote-runtime/shared-control-protocol.ts's `getCleanupRequest` as a
// bare cleanup envelope over that same connection, never through a
// negotiated oRPC tunnel — is unary, so slice 110 gave `RpcDispatcher` a
// fallback into the direct wiring for exactly that shape of caller and it
// dropped its legacy registration (see coworking-host-session-handlers.ts).
// Slice 112 gave `RpcDispatcher` the streaming sibling of that same
// fallback, so `subscribeSessionChanges` dropped too — the direct wiring
// alone (orpc/router-direct/coworking-host.ts, still required because a
// directly-wired domain must supply every procedure under its top-level
// contract key or the omitted ones vanish from the router entirely) now
// serves both the real oRPC path and the bare-envelope caller. Kept as a
// real (now empty) array rather than deleted, matching
// methods/orchestration/methods.ts's precedent.
export const COWORKING_HOST_SESSION_METHODS: RpcAnyMethod[] = []
