import type { RuntimeEmulatorSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let emulatorEventSubscriptionSeq = 0

// Why: emulator sessions are host resources; the feed spans every worktree.
export async function handleEmulatorEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeEmulatorSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onEmulatorEvent((event) => {
      emit(event)
    })

    const seq = ++emulatorEventSubscriptionSeq
    const subscriptionId = `emulator-events-${connectionId ?? 'inproc'}-${seq}`
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
