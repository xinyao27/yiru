import type {
  ClientEventsUnsubscribeParams,
  RuntimeClientEventSubscriptionEvent
} from '@yiru/runtime-protocol/contract'
import type { AuthenticatedRpcPrincipal } from '~shared/rpc-principal'
import type { RuntimeClientEvent } from '~shared/runtime-client-events'

import { callerClassOf } from '../access'
import type { RpcAnyMethod, RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let clientEventSubscriptionSeq = 0

function projectClientEvent(
  event: RuntimeClientEvent,
  principal: AuthenticatedRpcPrincipal | undefined
): RuntimeClientEvent {
  switch (callerClassOf(principal)) {
    case 'local':
    case 'mobile':
    case 'runtime':
      return event
    case 'coworking-host':
      // Why: Coworking peers can refetch through scope-adjudicated methods.
      // Streaming launch payloads would otherwise export commands, env values,
      // launch tokens, and machine-wide repo/worktree identifiers.
      return { type: 'reposChanged' }
  }
}

// Why: `unsubscribe` no longer carries a legacy registration — it is the
// unary cleanup companion of `subscribe` (see `handleClientEventsSubscribe`'s
// own note for that stream's history), and slice 110 gave `RpcDispatcher` a
// fallback into the direct wiring (orpc/router-direct/runtime-events.ts) for
// exactly that shape of bare-envelope caller.
export function handleClientEventsUnsubscribe(
  params: ClientEventsUnsubscribeParams,
  { runtime, connectionId }: RpcContext
) {
  const expectedPrefix = `runtime-client-events-${connectionId ?? 'inproc'}-`
  if (!params.subscriptionId.startsWith(expectedPrefix)) {
    return { unsubscribed: false }
  }
  runtime.cleanupSubscription(params.subscriptionId)
  return { unsubscribed: true }
}

// Why: kept as a plain streaming handler (not inline in a legacy
// registration) so orpc/router-direct.ts's `wireRuntimeStream` can call it —
// `runtime.clientEvents.*` is direct-wired in its entirety
// (router-direct/runtime-events.ts) with no legacy registration left.
// `subscribe` kept one through 切片 73/110 because
// `renderer/runtime/client-events.ts`'s Electron branch reaches
// `runtime.clientEvents.subscribe` through
// `window.api.runtimeEnvironments.subscribe`'s bare string-method channel,
// which never negotiates oRPC (docs/runtime-orpc-migration.md Phase 6
// D-stage, 切片 68/73) — streaming, so outside slice 110's dispatcher-fallback
// scope. Slice 112 gave `RpcDispatcher` the streaming sibling of that
// fallback (legacy-dispatch-fallback.ts's
// `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`), which drains this same
// function through `emit` for that caller, so `subscribe` dropped its
// registration too. `unsubscribe`'s cleanup-companion caller
// (`shared/remote-runtime/shared-control-subscriptions.ts`) is unary and was
// already served by the unary fallback. `driverEvents`/`progressEvents` have
// no such caller — see driver-events.ts/host-progress-events.ts, retired 切片
// 73.
export async function handleClientEventsSubscribe(
  _params: void,
  { runtime, connectionId, principal, signal }: RpcContext,
  emit: (event: RuntimeClientEventSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onClientEvent((event) => {
      emit(projectClientEvent(event, principal))
    })

    const seq = ++clientEventSubscriptionSeq
    const subscriptionId = `runtime-client-events-${connectionId ?? 'inproc'}-${seq}`
    runtime.registerSubscriptionCleanup(
      subscriptionId,
      () => {
        if (closed) {
          return
        }
        closed = true
        removeAbortListener()
        unsubscribe()
        emit({ type: 'end' })
        resolve()
      },
      connectionId
    )
    removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
    if (closed) {
      return
    }

    emit({ type: 'ready', subscriptionId })
  })
}

// Why: kept as a real (now empty) array rather than deleted, matching
// methods/orchestration/methods.ts's precedent — see
// `handleClientEventsSubscribe`'s own note for why it was the last leaf here.
export const CLIENT_EVENT_METHODS: readonly RpcAnyMethod[] = []
