export const MAX_CONCURRENT_COWORKING_RPCS = 32
export const MAX_COWORKING_SUBSCRIPTIONS = 64

export type ActiveCoworkingSubscription = {
  abort: AbortController
  cleanup: (() => void) | null
  unsubscribeInvalidation: (() => void) | null
}

export function safelyCleanupCoworkingSubscription(cleanup: (() => void) | null): void {
  try {
    cleanup?.()
  } catch {
    // Cleanup is best-effort after the stream has already lost authority.
  }
}
