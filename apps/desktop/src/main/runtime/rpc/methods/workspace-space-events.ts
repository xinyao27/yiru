import type { RuntimeWorkspaceSpaceEventsSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let workspaceSpaceScanEventSubscriptionSeq = 0

// Why: the scan is one host-wide singleton, so its progress is reported the
// same way to every paired client — read tier, it never drives the scan
// (same reasoning as `runtime.progressEvents.subscribe`). Phase 6 D-stage —
// plain function called directly from orpc/router-direct.ts via
// `wireRuntimeStream` instead of through a `defineStreamingMethod` legacy
// registration.
export async function handleWorkspaceSpaceEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeWorkspaceSpaceEventsSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onWorkspaceSpaceScanProgressEvent((progress) => {
      emit({ type: 'workspaceSpaceScanProgress', progress })
    })

    const seq = ++workspaceSpaceScanEventSubscriptionSeq
    const subscriptionId = `workspace-space-events-${connectionId ?? 'inproc'}-${seq}`
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
