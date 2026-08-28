import type { RuntimeHostProgressSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let hostProgressEventSubscriptionSeq = 0

// Why: the direct runtime-events router uses this emit-based streaming shape
// for desktop, web, and mobile oRPC subscriptions without a second transport.
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
