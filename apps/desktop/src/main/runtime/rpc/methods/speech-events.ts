import type { RuntimeSpeechSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let speechEventSubscriptionSeq = 0

// Why: read tier — reports model-download progress and dictation lifecycle,
// never drives either (same reasoning as `agentStatus.events.subscribe`).
// Phase 6 D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from orpc/router-direct.ts
// via `wireRuntimeStream` instead of through a `defineStreamingMethod` legacy
// registration.
export async function handleSpeechEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeSpeechSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onSpeechEvent((event) => {
      emit(event)
    })

    const seq = ++speechEventSubscriptionSeq
    const subscriptionId = `speech-events-${connectionId ?? 'inproc'}-${seq}`
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
