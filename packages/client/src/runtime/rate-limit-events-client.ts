import type { RateLimitState } from '@yiru/runtime-protocol/workbench/rate-limit-types'
import { useAppStore } from '~renderer/store/state'

import { createRuntimeOrpcClient } from './orpc-client'
import { getRateLimitsTarget } from './rate-limits-client'

const RATE_LIMIT_EVENTS_RECONNECT_MS = 1_000

export function subscribeRateLimitUpdates(onUpdate: (state: RateLimitState) => void): () => void {
  let cancelled = false
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const openStream = (): void => {
    controller?.abort()
    const target = getRateLimitsTarget()
    if (cancelled) {
      return
    }
    const streamController = new AbortController()
    controller = streamController
    void (async () => {
      let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
      try {
        connection = await createRuntimeOrpcClient(target, { signal: streamController.signal })
        const stream = await connection.client.accounts.subscribe(undefined, {
          signal: streamController.signal
        })
        for await (const event of stream) {
          if (streamController.signal.aborted) {
            return
          }
          if (event.type === 'ready' || event.type === 'snapshot') {
            onUpdate(event.snapshot.rateLimits)
          }
        }
      } catch {
        // Why: rate-limit events are advisory refreshes; the startup read remains
        // the fallback while a dropped stream reconnects.
      } finally {
        connection?.close()
        if (!cancelled && !streamController.signal.aborted) {
          retryTimer = setTimeout(openStream, RATE_LIMIT_EVENTS_RECONNECT_MS)
        }
      }
    })()
  }

  const unsubscribeTargetChanges = useAppStore.subscribe((state, previousState) => {
    if (
      state.settings?.activeRuntimeEnvironmentId !==
      previousState.settings?.activeRuntimeEnvironmentId
    ) {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      openStream()
    }
  })
  openStream()
  return () => {
    cancelled = true
    unsubscribeTargetChanges()
    controller?.abort()
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
  }
}
