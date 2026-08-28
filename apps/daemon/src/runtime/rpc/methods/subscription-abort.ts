type SubscriptionCleanupRegistry = {
  cleanupSubscription(subscriptionId: string): void
}

export function bindSubscriptionAbort(
  registry: SubscriptionCleanupRegistry,
  subscriptionId: string,
  signal: AbortSignal | undefined
): () => void {
  if (!signal) {
    return () => {}
  }

  const abortSubscription = (): void => {
    // Why: an oRPC iterator is one logical subscription. Its cancellation must
    // release that exact registry entry without sweeping sibling streams.
    registry.cleanupSubscription(subscriptionId)
  }
  if (signal.aborted) {
    abortSubscription()
    return () => {}
  }

  signal.addEventListener('abort', abortSubscription, { once: true })
  return () => signal.removeEventListener('abort', abortSubscription)
}
