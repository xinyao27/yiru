import type { RuntimeDriverSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let driverEventSubscriptionSeq = 0

// Why: Phase 6 D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from
// orpc/router-direct/runtime-events.ts via `wireRuntimeStream` instead of
// through a `defineStreamingMethod` legacy registration. Retired (切片 73):
// unlike `runtime.clientEvents.subscribe`, no caller anywhere reaches this
// leaf through the bare `window.api.runtimeEnvironments.subscribe` channel —
// its only callers are the web shim's own negotiated
// `createRuntimeStreamFanOut()` implementation (`renderer/web/preload-api.ts`)
// and mobile's always-negotiated oRPC client.
export async function handleRuntimeDriverEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeDriverSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onDriverEvent((event) => {
      emit(event)
    })

    const seq = ++driverEventSubscriptionSeq
    const subscriptionId = `runtime-driver-events-${connectionId ?? 'inproc'}-${seq}`
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
