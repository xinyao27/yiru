import type { RuntimeBrowserGuestSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let browserGuestEventSubscriptionSeq = 0

// Why: direct-wired only (orpc/router-direct/browser-streams.ts) — its client
// always negotiates authenticated oRPC, so this needs no alternate transport.
// The feed is host-wide — every
// browser page id, navigated URL, and download filename on the machine flows
// through it — so it carries the same host/host grant the rest of the browser
// surface requires and can never be narrowed to a single worktree.
export async function handleBrowserGuestEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeBrowserGuestSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onBrowserGuestEvent((event) => {
      emit(event)
    })

    const seq = ++browserGuestEventSubscriptionSeq
    const subscriptionId = `browser-guest-events-${connectionId ?? 'inproc'}-${seq}`
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
