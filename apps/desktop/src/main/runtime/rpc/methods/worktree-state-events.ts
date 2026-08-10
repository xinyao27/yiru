import type { RuntimeWorktreeStateSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let worktreeStateEventSubscriptionSeq = 0

// Why: base drift and remote-branch conflicts are reported for every repo on
// the machine, so the stream is host-wide rather than worktree-scoped. Phase 6
// D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from orpc/router-direct.ts via
// `wireRuntimeStream` instead of through a `defineStreamingMethod` legacy
// registration (same split as settings-events.ts).
export async function handleWorktreeStateEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeWorktreeStateSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onWorktreeStateEvent((event) => {
      emit(event)
    })

    const seq = ++worktreeStateEventSubscriptionSeq
    const subscriptionId = `worktree-state-events-${connectionId ?? 'inproc'}-${seq}`
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
