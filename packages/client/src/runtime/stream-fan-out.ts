type RuntimeStreamFanOutOptions<TClient, TEvent> = {
  resolveClient: () => Promise<TClient>
  open: (client: TClient, signal: AbortSignal) => Promise<AsyncIterable<TEvent>>
}

export type RuntimeStreamFanOut<TEvent> = {
  subscribe: (listener: (event: TEvent) => void) => () => void
}

// Why: several compatibility callbacks consume slices of one host-wide oRPC
// stream. Sharing one upstream iterator avoids multiplying server subscription
// state while keeping the legacy synchronous unsubscribe shape at the adapter.
export function createRuntimeStreamFanOut<TClient, TEvent>(
  options: RuntimeStreamFanOutOptions<TClient, TEvent>
): RuntimeStreamFanOut<TEvent> {
  const listeners = new Set<(event: TEvent) => void>()
  let stopUpstream: (() => void) | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  const openUpstream = (): void => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    const currentGeneration = ++generation
    const controller = new AbortController()
    stopUpstream = () => controller.abort()
    void (async () => {
      try {
        const client = await options.resolveClient()
        if (controller.signal.aborted) {
          return
        }
        const stream = await options.open(client, controller.signal)
        for await (const event of stream) {
          if (controller.signal.aborted) {
            return
          }
          for (const listener of Array.from(listeners)) {
            try {
              listener(event)
            } catch (error) {
              console.error('[runtime] stream listener failed', error)
            }
          }
        }
      } catch {
        // Why: host streams are advisory invalidations. A dropped iterator
        // must not become an unhandled rejection during renderer teardown.
      } finally {
        if (generation === currentGeneration) {
          stopUpstream = null
          if (listeners.size > 0 && !controller.signal.aborted) {
            retryTimer = setTimeout(openUpstream, 1_000)
          }
        }
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
          generation++
          stopUpstream?.()
          stopUpstream = null
          if (retryTimer) {
            clearTimeout(retryTimer)
            retryTimer = null
          }
        }
      }
    }
  }
}
