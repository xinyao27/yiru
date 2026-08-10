import type { RuntimeBrowserGuestSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let browserGuestEventSubscriptionSeq = 0

// Why: direct-wired only (orpc/router-direct/browser-streams.ts) — the web shim's
// own `client.browser.guestEvents.subscribe` (renderer/web/preload-api.ts) is its
// only caller and always negotiates real oRPC, so this never needs a legacy twin
// (docs/runtime-orpc-migration.md Phase 6 D-stage). The feed is host-wide — every
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
