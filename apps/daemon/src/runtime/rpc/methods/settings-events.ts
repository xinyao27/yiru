import type { RuntimeSettingsSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let settingsEventSubscriptionSeq = 0

// Why: settings are a single host-wide document. Phase 6 D-stage — plain
// function with the emit-based streaming shape (`RuntimeOrpcStreamHandler`),
// called directly from orpc/router-direct.ts via `wireRuntimeStream` instead
// of through a `defineStreamingMethod` legacy registration (same split as
// workspace-port-events.ts's streaming pilot).
export async function handleSettingsEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeSettingsSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onSettingsChangedEvent((event) => {
      emit(event)
    })

    const seq = ++settingsEventSubscriptionSeq
    const subscriptionId = `settings-events-${connectionId ?? 'inproc'}-${seq}`
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
