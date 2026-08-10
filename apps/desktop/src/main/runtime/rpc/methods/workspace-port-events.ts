import type { RuntimeWorkspacePortSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let workspacePortEventSubscriptionSeq = 0

// Why: Phase 6 D-stage — direct-wired only (orpc/router-direct/workspace.ts
// calls this via `wireRuntimeStream`). This stream never depended on the
// reconnect/replay-tagging mechanism that pins session/runtime/coworking's
// streams — it is absent from `shouldUseSharedControlSubscription`
// (environment-transport-routing.ts) — so once the web transport fix (切片
// 63) removed the last reason for a legacy twin, it retired with `scan`/
// `kill` (切片 86) rather than staying pinned alongside them.
export async function subscribeRuntimeWorkspacePortEvents(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeWorkspacePortSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onWorkspacePortAdvertisedUrlChangedEvent((event) => {
      emit(event)
    })

    const seq = ++workspacePortEventSubscriptionSeq
    const subscriptionId = `workspace-port-events-${connectionId ?? 'inproc'}-${seq}`
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
