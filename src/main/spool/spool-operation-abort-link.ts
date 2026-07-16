export type SpoolOperationAbortLink = {
  controller: AbortController
  unlink(): void
}

/** Links one caller cancellation lifetime into an owner-side operation controller. */
export function linkSpoolOperationAbort(callerSignal?: AbortSignal): SpoolOperationAbortLink {
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  if (callerSignal?.aborted) {
    controller.abort()
  } else {
    callerSignal?.addEventListener('abort', abort, { once: true })
  }
  return {
    controller,
    unlink: () => callerSignal?.removeEventListener('abort', abort)
  }
}
