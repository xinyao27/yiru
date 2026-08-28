import type { RuntimeEmulatorSubscriptionEvent } from '@yiru/runtime-protocol/contract'
import { useAppStore } from '~renderer/store/state'

import { createRuntimeOrpcClient } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

type EmulatorEventHandlers = {
  onAutoAttach: (event: {
    worktreeId: string
    info: { deviceUdid: string; streamUrl: string; wsUrl: string; axUrl?: string }
  }) => void
  onPaneFocus: (event: { worktreeId: string }) => void
}

const EMULATOR_EVENTS_RECONNECT_MS = 1_000

function emulatorEventsTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export function subscribeEmulatorEvents(handlers: EmulatorEventHandlers): () => void {
  let cancelled = false
  let generation = 0
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const openStream = (): void => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    controller?.abort()
    if (cancelled) {
      return
    }
    const currentGeneration = ++generation
    const streamController = new AbortController()
    controller = streamController
    void (async () => {
      let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
      try {
        connection = await createRuntimeOrpcClient(emulatorEventsTarget(), {
          signal: streamController.signal
        })
        const stream = await connection.client.emulator.events.subscribe(undefined, {
          signal: streamController.signal
        })
        for await (const event of stream) {
          if (streamController.signal.aborted || currentGeneration !== generation) {
            return
          }
          dispatchEmulatorEvent(event, handlers)
        }
      } catch {
        // Why: renderer teardown aborts the iterator; transient host loss is
        // retried below so the feature does not own transport recovery.
      } finally {
        connection?.close()
        if (!cancelled && !streamController.signal.aborted && currentGeneration === generation) {
          retryTimer = setTimeout(openStream, EMULATOR_EVENTS_RECONNECT_MS)
        }
      }
    })()
  }

  const unsubscribeTargetChanges = useAppStore.subscribe((state, previousState) => {
    if (
      state.settings?.activeRuntimeEnvironmentId !==
      previousState.settings?.activeRuntimeEnvironmentId
    ) {
      openStream()
    }
  })
  openStream()
  return () => {
    cancelled = true
    generation += 1
    unsubscribeTargetChanges()
    controller?.abort()
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
  }
}

function dispatchEmulatorEvent(
  event: RuntimeEmulatorSubscriptionEvent,
  handlers: EmulatorEventHandlers
): void {
  switch (event.type) {
    case 'autoAttach':
      handlers.onAutoAttach(event)
      return
    case 'paneFocus':
      handlers.onPaneFocus(event)
      break
    case 'ready':
    case 'end':
      break
  }
}
