import type { RuntimeHostProgressSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let hostProgressEventSubscriptionSeq = 0

// Why: Phase 6 D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from
// orpc/router-direct/runtime-events.ts via `wireRuntimeStream` instead of
// through a `defineStreamingMethod` legacy registration. Retired (切片 73):
// same reasoning as driver-events.ts — no caller reaches this leaf through
// the bare `window.api.runtimeEnvironments.subscribe` channel.
export async function handleRuntimeProgressEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeHostProgressSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onHostProgressEvent((event) => {
      emit(event)
    })

    const seq = ++hostProgressEventSubscriptionSeq
    const subscriptionId = `runtime-progress-events-${connectionId ?? 'inproc'}-${seq}`
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
