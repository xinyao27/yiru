import type { WebRuntimeOrpcClient } from './legacy-orpc-link'

type StreamOpener<TEvent> = (
  client: WebRuntimeOrpcClient,
  signal: AbortSignal
) => Promise<AsyncIterable<TEvent>>

type RuntimeStreamFanOutOptions<TEvent> = {
  // Resolves the oRPC client for the environment that is active right now.
  // Returns null while no runtime is paired, which keeps the fan-out dormant
  // instead of throwing into a React subscribe callback.
  resolveClient: () => Promise<WebRuntimeOrpcClient | null>
  open: StreamOpener<TEvent>
}

export type RuntimeStreamFanOut<TEvent> = {
  subscribe: (listener: (event: TEvent) => void) => () => void
  // Drops the upstream stream and forces the next subscriber to reopen it.
  // Called when the paired environment changes underneath the adapter.
  reset: () => void
}

// Why: a runtime subscription is one host-wide stream, but several unrelated
// `on*` callbacks in the web adapter each want a slice of it. Opening one
// upstream subscription per callback would multiply server-side subscription
// state; this fans a single stream out to every listener and closes it once the
// last one detaches.
export function createRuntimeStreamFanOut<TEvent>(
  options: RuntimeStreamFanOutOptions<TEvent>
): RuntimeStreamFanOut<TEvent> {
  const listeners = new Set<(event: TEvent) => void>()
  let generation = 0
  let stopUpstream: (() => void) | null = null

  const openUpstream = (): void => {
    const controller = new AbortController()
    const streamGeneration = ++generation
    stopUpstream = () => controller.abort()

    void (async () => {
      try {
        const client = await options.resolveClient()
        if (!client || controller.signal.aborted) {
          return
        }
        const stream = await options.open(client, controller.signal)
        for await (const event of stream) {
          if (controller.signal.aborted || streamGeneration !== generation) {
            return
          }
          for (const listener of Array.from(listeners)) {
            listener(event)
          }
        }
      } catch {
        // Why: a dropped stream must not surface as an unhandled rejection.
        // The web client reconnects the socket underneath; the next subscriber
        // reopens the stream, and until then listeners simply go quiet.
      }
    })()
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        openUpstream()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          stopUpstream?.()
          stopUpstream = null
        }
      }
    },
    reset: () => {
      generation++
      stopUpstream?.()
      stopUpstream = null
      if (listeners.size > 0) {
        openUpstream()
      }
    }
  }
}
