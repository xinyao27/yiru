import type { RuntimeGitHubSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let githubEventSubscriptionSeq = 0

// Why: the refresh coordinator broadcasts across every tracked repo, so the
// stream is host-wide rather than project-scoped. Phase 6 D-stage — plain
// function with the emit-based streaming shape (`RuntimeOrpcStreamHandler`),
// called directly from orpc/router-direct.ts via `wireRuntimeStream` instead
// of through a `defineStreamingMethod` legacy registration (same split as
// worktree-state-events.ts).
export async function handleGitHubEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeGitHubSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onGitHubEvent((event) => {
      emit(event)
    })

    const seq = ++githubEventSubscriptionSeq
    const subscriptionId = `github-events-${connectionId ?? 'inproc'}-${seq}`
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
