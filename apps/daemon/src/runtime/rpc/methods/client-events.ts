import type {
  ClientEventsUnsubscribeParams,
  RuntimeClientEventSubscriptionEvent
} from '@yiru/runtime-protocol/contract'

import type { RpcAnyMethod, RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let clientEventSubscriptionSeq = 0

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

// Why: the direct runtime-events router and its subscription lifecycle share
// this plain streaming handler across every authenticated oRPC client lane.
export async function handleClientEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeClientEventSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onClientEvent((event) => {
      emit(event)
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
