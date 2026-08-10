import { AsyncIteratorClass, ORPCError } from '@orpc/client'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

import { createRuntimeRpcAbortError } from './abortable-runtime-environment-call'
import type { RuntimeOrpcBinaryListener } from './orpc-binary-side-channel'
import { unwrapRuntimeRpcResult } from './rpc-response'

type LegacyStreamItem =
  | { type: 'value'; value: unknown }
  | { type: 'error'; error: unknown }
  | { type: 'done' }

type LegacySubscriptionHandle = Awaited<ReturnType<typeof window.api.runtimeEnvironments.subscribe>>

export async function createLegacyRuntimeOrpcStream(args: {
  environmentId: string
  method: string
  input: unknown
  timeoutMs?: number
  signal?: AbortSignal
  onBinary?: RuntimeOrpcBinaryListener
}): Promise<AsyncIteratorClass<unknown, void, void>> {
  const queue = new LegacyRuntimeStreamQueue()
  let subscription: LegacySubscriptionHandle | null = null
  let isReleased = false
  const release = (): void => {
    if (isReleased) {
      return
    }
    isReleased = true
    args.signal?.removeEventListener('abort', onAbort)
    queue.end()
    subscription?.unsubscribe()
  }
  const onAbort = (): void => {
    queue.fail(args.signal?.reason ?? createRuntimeRpcAbortError())
    release()
  }
  if (args.signal?.aborted) {
    throw args.signal.reason ?? createRuntimeRpcAbortError()
  }
  args.signal?.addEventListener('abort', onAbort, { once: true })

  const pending = window.api.runtimeEnvironments.subscribe(
    {
      selector: args.environmentId,
      method: args.method,
      params: args.input,
      timeoutMs: args.timeoutMs
    },
    {
      onResponse: (response) => {
        try {
          queue.push(unwrapRuntimeRpcResult(response as RuntimeRpcResponse<unknown>))
        } catch (error) {
          queue.fail(error)
          release()
        }
      },
      onBinary: (frame) => args.onBinary?.(frame),
      onError: (error) => {
        queue.fail(new ORPCError(error.code, { message: error.message }))
        release()
      },
      onClose: release
    }
  )
  void pending.then(
    (handle) => {
      subscription = handle
      if (isReleased) {
        handle.unsubscribe()
      }
    },
    () => {}
  )
  try {
    subscription = await abortable(pending, args.signal)
  } catch (error) {
    release()
    throw error
  }

  return new AsyncIteratorClass(
    () => queue.next(),
    async () => {
      release()
    }
  )
}

class LegacyRuntimeStreamQueue {
  private readonly items: LegacyStreamItem[] = []
  private waiter: ((item: LegacyStreamItem) => void) | null = null
  private isTerminal = false

  push(value: unknown): void {
    if (!this.isTerminal) {
      this.enqueue({ type: 'value', value })
    }
  }

  fail(error: unknown): void {
    if (!this.isTerminal) {
      this.isTerminal = true
      this.enqueue({ type: 'error', error })
    }
  }

  end(): void {
    if (!this.isTerminal) {
      this.isTerminal = true
      this.enqueue({ type: 'done' })
    }
  }

  async next(): Promise<IteratorResult<unknown, void>> {
    const queued = this.items.shift()
    const item =
      queued ??
      (await new Promise<LegacyStreamItem>((resolve) => {
        this.waiter = resolve
      }))
    if (item.type === 'error') {
      throw item.error
    }
    return item.type === 'done'
      ? { done: true, value: undefined }
      : { done: false, value: item.value }
  }

  private enqueue(item: LegacyStreamItem): void {
    if (this.waiter) {
      const waiter = this.waiter
      this.waiter = null
      waiter(item)
    } else {
      this.items.push(item)
    }
  }
}

function abortable<TResult>(promise: Promise<TResult>, signal?: AbortSignal): Promise<TResult> {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createRuntimeRpcAbortError())
  }
  return new Promise((resolve, reject) => {
    const finish = (complete: () => void): void => {
      signal.removeEventListener('abort', onAbort)
      complete()
    }
    const onAbort = (): void => finish(() => reject(signal.reason ?? createRuntimeRpcAbortError()))
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    )
  })
}
