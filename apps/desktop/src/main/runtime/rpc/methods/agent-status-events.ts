import type { RuntimeAgentStatusSubscriptionEvent } from '@yiru/runtime-protocol/contract'
import { enrichAgentStatusIpcPayload } from '~main/agent-hooks/agent-status-ipc-boundary'
import { getMigrationUnsupportedPtySnapshot } from '~main/agent-hooks/migration-unsupported-pty-state'
import { agentHookServer } from '~main/agent-hooks/server'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let agentStatusEventSubscriptionSeq = 0

// Why: the hook server reports for every pane on the machine. Phase 6
// D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from orpc/router-direct.ts via
// `wireRuntimeStream` instead of through a `defineStreamingMethod` legacy
// registration (same split as settings-events.ts's streaming pilot).
export async function handleAgentStatusEventsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeAgentStatusSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onAgentStatusEvent((event) => {
      emit(event)
    })

    const seq = ++agentStatusEventSubscriptionSeq
    const subscriptionId = `agent-status-events-${connectionId ?? 'inproc'}-${seq}`
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
    // Why: replay the current state on `ready` so a subscriber never has a
    // gap between "subscribed" and "knows current state" — the stream
    // previously only carried future events, which is why `getSnapshot`/
    // `getMigrationUnsupportedSnapshot` had to exist as separate procedures
    // in the first place. Mirrors `accounts.subscribe`'s `ready.snapshot`.
    emit({
      type: 'ready',
      subscriptionId,
      snapshot: {
        statuses: agentHookServer
          .getStatusSnapshot()
          .map((entry) => enrichAgentStatusIpcPayload(entry, runtime)),
        migrationUnsupportedPtys: getMigrationUnsupportedPtySnapshot()
      }
    })
  })
}
