import type { RuntimeNestedRepoScanProgressSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let nestedRepoScanEventSubscriptionSeq = 0

// Why: no narrower scope than "this host" to key the stream on — the client
// filters ticks by the scanId it started, same as the preload event this
// replaces (`projectGroups.onNestedScanProgress`). Phase 6 D-stage — plain
// function called directly from orpc/router-direct.ts via `wireRuntimeStream`
// instead of through a `defineStreamingMethod` legacy registration.
export async function handleProjectGroupEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeNestedRepoScanProgressSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onNestedRepoScanProgressEvent((event) => {
      emit(event)
    })

    const seq = ++nestedRepoScanEventSubscriptionSeq
    const subscriptionId = `project-group-events-${connectionId ?? 'inproc'}-${seq}`
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
