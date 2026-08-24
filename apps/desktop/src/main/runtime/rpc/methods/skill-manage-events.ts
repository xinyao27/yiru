import type { RuntimeSkillUpdateRunSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let skillUpdateRunSubscriptionSeq = 0

// Why: one shared runner reports to every connected client. Phase 6 D-stage — plain function
// with the emit-based streaming shape (`RuntimeOrpcStreamHandler`), called
// directly from orpc/router-direct.ts via `wireRuntimeStream` instead of
// through a `defineStreamingMethod` legacy registration.
export async function handleSkillManageEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeSkillUpdateRunSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onSkillUpdateRunEvent((event) => {
      emit(event)
    })

    const seq = ++skillUpdateRunSubscriptionSeq
    const subscriptionId = `skill-update-run-events-${connectionId ?? 'inproc'}-${seq}`
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
