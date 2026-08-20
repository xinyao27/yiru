import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { isRuntimeSubscriptionReplayResponse } from '@yiru/runtime-protocol/subscription-replay'
import type {
  RuntimeClientEvent,
  RuntimeClientEventStreamMessage
} from '~shared/runtime-client-events'

import { createRuntimeOrpcClient, isWebRuntimeClient } from './orpc-client'
import { runtimeEnvironmentsClient } from './runtime-environments-client'

export type RuntimeClientEventSubscription = {
  unsubscribe: () => void
}

export async function subscribeRuntimeClientEvents(
  environmentId: string,
  onEvent: (event: RuntimeClientEvent) => void,
  onError: (error: unknown) => void = console.warn,
  // Why: client events emitted while the shared-control transport was down are
  // lost, not queued. The replay tag on the first post-reconnect response is
  // the renderer's only signal that mirrored event-derived state (e.g. the
  // per-environment SSH bucket) may have missed transitions and must resync.
  onReplayedAfterReconnect?: () => void
): Promise<RuntimeClientEventSubscription> {
  // Why: the browser compatibility subscription skips capability negotiation,
  // while Electron's local shell transport already negotiates it. Web must use
  // the direct oRPC subscription after the legacy dispatcher retires this method.
  if (isWebRuntimeClient()) {
    return subscribeRuntimeClientEventsViaOrpc(environmentId, onEvent, onError)
  }
  const handle = await runtimeEnvironmentsClient.subscribe(
    {
      selector: environmentId,
      method: 'runtime.clientEvents.subscribe',
      timeoutMs: 15_000
    },
    {
      onResponse: (response) => {
        handleRuntimeClientEventResponse(response, onEvent, onError, onReplayedAfterReconnect)
      },
      onError
    }
  )
  return { unsubscribe: handle.unsubscribe }
}

// Why: a replayed-after-reconnect signal never applies here — that tag is only
// ever set by Electron's shared-control connection reconnect logic (see
// `shared-control-state.ts`), which this real oRPC event iterator does not go
// through — so there is no `onReplayedAfterReconnect` callback to invoke. A
// mid-stream drop ends the iterator without retrying, matching this method's
// existing behavior on web before this change (it is not in the small set of
// methods `WebRuntimeClient` replays after a reconnect).
async function subscribeRuntimeClientEventsViaOrpc(
  environmentId: string,
  onEvent: (event: RuntimeClientEvent) => void,
  onError: (error: unknown) => void
): Promise<RuntimeClientEventSubscription> {
  const controller = new AbortController()
  const connection = await createRuntimeOrpcClient(
    { kind: 'environment', environmentId },
    { signal: controller.signal }
  )
  try {
    const stream = await connection.client.runtime.clientEvents.subscribe(undefined, {
      signal: controller.signal
    })
    void (async () => {
      try {
        for await (const message of stream) {
          if (controller.signal.aborted) {
            return
          }
          if (message.type === 'ready' || message.type === 'end') {
            continue
          }
          if (isRuntimeClientEvent(message)) {
            onEvent(message)
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onError(error)
        }
      } finally {
        connection.close()
      }
    })()
    return { unsubscribe: () => controller.abort() }
  } catch (error) {
    connection.close()
    throw error
  }
}

function handleRuntimeClientEventResponse(
  response: RuntimeRpcResponse<unknown>,
  onEvent: (event: RuntimeClientEvent) => void,
  onError: (error: unknown) => void,
  onReplayedAfterReconnect?: () => void
): void {
  if (response.ok === false) {
    onError(response.error)
    return
  }
  if (isRuntimeSubscriptionReplayResponse(response)) {
    onReplayedAfterReconnect?.()
  }
  const message = response.result as RuntimeClientEventStreamMessage
  if (message.type === 'ready' || message.type === 'end') {
    return
  }
  if (isRuntimeClientEvent(message)) {
    onEvent(message)
  }
}

function isRuntimeClientEvent(
  message: RuntimeClientEventStreamMessage
): message is RuntimeClientEvent {
  return (
    message.type === 'reposChanged' ||
    message.type === 'worktreesChanged' ||
    message.type === 'activateWorktree' ||
    message.type === 'worktreeHeadIdentitiesChanged'
  )
}
