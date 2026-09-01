import type { RuntimeWorkspaceCleanupEventsSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let workspaceCleanupScanEventSubscriptionSeq = 0

// Why: no narrower scope than "this host" to key the stream on — the client
// filters ticks by the scanId it started, same shape as
// `projectGroup.events.subscribe`. Phase 6 D-stage — plain function called
// directly from orpc/router-direct.ts via `wireRuntimeStream` instead of
// through a `defineStreamingMethod` legacy registration.
export async function handleWorkspaceCleanupEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeWorkspaceCleanupEventsSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onWorkspaceCleanupScanProgressEvent((progress) => {
      emit({ type: 'workspaceCleanupScanProgress', progress })
    })

    const seq = ++workspaceCleanupScanEventSubscriptionSeq
    const subscriptionId = `workspace-cleanup-events-${connectionId ?? 'inproc'}-${seq}`
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
