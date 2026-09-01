import type { RuntimeClientEvent } from '@yiru/runtime-protocol/workbench/runtime-client-events'

import { createRuntimeOrpcClient } from './orpc-client'

export type RuntimeClientEventSubscription = {
  unsubscribe: () => void
}

export async function subscribeRuntimeClientEvents(
  environmentId: string,
  onEvent: (event: RuntimeClientEvent) => void,
  onError: (error: unknown) => void = console.warn
): Promise<RuntimeClientEventSubscription> {
  return subscribeRuntimeClientEventsViaOrpc(environmentId, onEvent, onError)
}

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

function isRuntimeClientEvent(message: RuntimeClientEvent): message is RuntimeClientEvent {
  return (
    message.type === 'reposChanged' ||
    message.type === 'worktreesChanged' ||
    message.type === 'activateWorktree' ||
    message.type === 'worktreeHeadIdentitiesChanged'
  )
}
