import type { RuntimeUISubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let uiEventSubscriptionSeq = 0

// Why: UI view-state is a single host-wide document. Phase 6 D-stage — plain
// function with the emit-based streaming shape (`RuntimeOrpcStreamHandler`),
// called directly from orpc/router-direct.ts via `wireRuntimeStream` instead
// of through a `defineStreamingMethod` legacy registration (same split as
// workspace-port-events.ts's streaming pilot).
export async function handleUIEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeUISubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onUIChangedEvent((event) => {
      emit(event)
    })

    const seq = ++uiEventSubscriptionSeq
    const subscriptionId = `ui-events-${connectionId ?? 'inproc'}-${seq}`
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
