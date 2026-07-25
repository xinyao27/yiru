export const MAX_CONCURRENT_SPOOL_RPCS = 32
export const MAX_SPOOL_SUBSCRIPTIONS = 64

export type ActiveSpoolSubscription = {
  abort: AbortController
  cleanup: (() => void) | null
  unsubscribeInvalidation: (() => void) | null
}

export function safelyCleanupSpoolSubscription(cleanup: (() => void) | null): void {
  try {
    cleanup?.()
  } catch {
    // Cleanup is best-effort after the stream has already lost authority.
  }
}
