export function createSessionInventoryAbortController(
  signals: readonly (AbortSignal | undefined)[]
): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController()
  const bindings: { signal: AbortSignal; listener: () => void }[] = []
  for (const signal of signals) {
    if (!signal) {
      continue
    }
    const listener = (): void => controller.abort(signal.reason)
    if (signal.aborted) {
      listener()
      break
    }
    signal.addEventListener('abort', listener, { once: true })
    bindings.push({ signal, listener })
  }
  return {
    controller,
    dispose: () => {
      for (const binding of bindings) {
        binding.signal.removeEventListener('abort', binding.listener)
      }
    }
  }
}

export function waitForSessionInventoryAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (!signal) {
    return promise
  }
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => reject(signal.reason)
    signal.addEventListener('abort', aborted, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', aborted)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', aborted)
        reject(error)
      }
    )
  })
}
