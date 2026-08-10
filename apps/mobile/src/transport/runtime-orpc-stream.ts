type StreamQueueEntry =
  | { type: 'event'; value: unknown }
  | { type: 'error'; error: unknown }
  | { type: 'end' }

type PendingNext = {
  resolve: (result: IteratorResult<unknown>) => void
  reject: (error: unknown) => void
}

export type RuntimeOrpcEventStream = AsyncIterableIterator<unknown> & {
  push: (value: unknown) => void
  fail: (error: unknown) => void
  finish: () => void
  cancel: (reason?: unknown) => void
  signal: AbortSignal
}

export function createRuntimeOrpcEventStream(
  run: (stream: RuntimeOrpcEventStream) => Promise<void>
): RuntimeOrpcEventStream {
  const stream = new BufferedRuntimeOrpcStream()
  void run(stream).then(stream.finish, stream.fail)
  return stream
}

class BufferedRuntimeOrpcStream implements RuntimeOrpcEventStream {
  private readonly controller = new AbortController()
  private readonly queue: StreamQueueEntry[] = []
  private readonly pending: PendingNext[] = []
  private isFinished = false

  get signal(): AbortSignal {
    return this.controller.signal
  }

  push(value: unknown): void {
    if (!this.isFinished) {
      this.enqueue({ type: 'event', value })
    }
  }

  fail(error: unknown): void {
    if (this.isFinished) {
      return
    }
    this.isFinished = true
    this.controller.abort(error)
    this.enqueue({ type: 'error', error })
  }

  finish(): void {
    if (this.isFinished) {
      return
    }
    this.isFinished = true
    this.controller.abort()
    this.enqueue({ type: 'end' })
  }

  cancel(reason?: unknown): void {
    if (this.isFinished) {
      return
    }
    this.isFinished = true
    this.controller.abort(reason)
    this.enqueue({ type: 'end' })
  }

  next(): Promise<IteratorResult<unknown>> {
    const entry = this.queue.shift()
    if (entry) {
      return this.result(entry)
    }
    if (this.isFinished) {
      return Promise.resolve({ done: true, value: undefined })
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject })
    })
  }

  async return(value?: unknown): Promise<IteratorResult<unknown>> {
    this.cancel()
    return { done: true, value }
  }

  async throw(error?: unknown): Promise<IteratorResult<unknown>> {
    this.cancel(error)
    throw error
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
    return this
  }

  private enqueue(entry: StreamQueueEntry): void {
    const pending = this.pending.shift()
    if (!pending) {
      this.queue.push(entry)
      return
    }
    void this.result(entry).then(pending.resolve, pending.reject)
  }

  private result(entry: StreamQueueEntry): Promise<IteratorResult<unknown>> {
    if (entry.type === 'event') {
      return Promise.resolve({ done: false, value: entry.value })
    }
    if (entry.type === 'error') {
      return Promise.reject(entry.error)
    }
    return Promise.resolve({ done: true, value: undefined })
  }
}

export async function consumeRuntimeOrpcIterator(
  iterator: AsyncIterator<unknown>,
  stream: RuntimeOrpcEventStream,
  onEvent?: (event: unknown) => void
): Promise<'ended' | 'cancelled'> {
  const onAbort = (): void => {
    void iterator.return?.()
  }
  stream.signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (!stream.signal.aborted) {
      const next = await iterator.next()
      if (next.done) {
        return 'ended'
      }
      onEvent?.(next.value)
      stream.push(next.value)
    }
    return 'cancelled'
  } finally {
    stream.signal.removeEventListener('abort', onAbort)
    if (stream.signal.aborted) {
      await iterator.return?.()
    }
  }
}
