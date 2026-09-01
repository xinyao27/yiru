const RUNTIME_UNAVAILABLE_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000]

export async function retryRuntimeUnavailable<TResult>(
  operation: () => Promise<TResult>,
  isCancelled: () => boolean
): Promise<TResult> {
  for (const delayMs of RUNTIME_UNAVAILABLE_RETRY_DELAYS_MS) {
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isCancelled() || message !== 'runtime_unavailable') {
        throw error
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
      if (isCancelled()) {
        throw error
      }
    }
  }
  return operation()
}
