import { ORPCError } from '@orpc/client'
import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract'

import type { BrowserScreencastFrame } from './browser-screencast-protocol'

export type RuntimeOrpcClient = ContractRouterClient<typeof runtimeContract>

export type RuntimeOrpcProcedure<TInput, TOutput> = (
  input: TInput,
  options?: { signal?: AbortSignal }
) => Promise<TOutput>

export type RuntimeOrpcClientSource = {
  readonly orpc: RuntimeOrpcClient
}

export type RuntimeOrpcCallOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

export type RuntimeOrpcSubscribeOptions = {
  signal?: AbortSignal
  onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  onError?: (error: unknown) => void
}

type RuntimeOrpcSubscriptionDetails = Pick<RuntimeOrpcSubscribeOptions, 'onBinaryFrame'>

const subscriptionDetailsBySignal = new WeakMap<AbortSignal, RuntimeOrpcSubscriptionDetails>()

export async function callRuntimeOrpc<TInput, TOutput>(
  source: RuntimeOrpcClientSource,
  selectProcedure: (client: RuntimeOrpcClient) => RuntimeOrpcProcedure<TInput, TOutput>,
  input: TInput,
  options: RuntimeOrpcCallOptions = {}
): Promise<TOutput> {
  const callSignal = createCallSignal(options)
  try {
    return await selectProcedure(source.orpc)(
      input,
      callSignal.signal ? { signal: callSignal.signal } : undefined
    )
  } finally {
    callSignal.close()
  }
}

export function subscribeRuntimeOrpc<TInput, TEvent>(
  source: RuntimeOrpcClientSource,
  selectProcedure: (
    client: RuntimeOrpcClient
  ) => RuntimeOrpcProcedure<TInput, AsyncIterator<TEvent>>,
  input: TInput,
  onEvent: (event: TEvent) => void,
  options: RuntimeOrpcSubscribeOptions = {}
): () => void {
  const controller = new AbortController()
  const onExternalAbort = (): void => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) {
    onExternalAbort()
  } else {
    options.signal?.addEventListener('abort', onExternalAbort, { once: true })
  }
  subscriptionDetailsBySignal.set(
    controller.signal,
    options.onBinaryFrame ? { onBinaryFrame: options.onBinaryFrame } : {}
  )
  let iterator: AsyncIterator<TEvent> | null = null
  void (async () => {
    try {
      iterator = await selectProcedure(source.orpc)(input, { signal: controller.signal })
      while (!controller.signal.aborted) {
        const next = await iterator.next()
        if (next.done) {
          return
        }
        onEvent(next.value)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        options.onError?.(error)
      }
    } finally {
      subscriptionDetailsBySignal.delete(controller.signal)
    }
  })()
  return () => {
    options.signal?.removeEventListener('abort', onExternalAbort)
    controller.abort()
    void iterator?.return?.()
  }
}

export function isRuntimeOrpcErrorCode(error: unknown, code: string): boolean {
  const actualCode = runtimeOrpcErrorCode(error)
  if (!actualCode) {
    return false
  }
  if (actualCode.toLowerCase() === code.toLowerCase()) {
    return true
  }
  return actualCode.toLowerCase() === 'not_found' && code === 'method_not_found'
}

export function readRuntimeOrpcSubscriptionDetails(
  signal: AbortSignal | undefined
): RuntimeOrpcSubscriptionDetails | undefined {
  return signal ? subscriptionDetailsBySignal.get(signal) : undefined
}

function runtimeOrpcErrorCode(error: unknown): string | null {
  if (error instanceof ORPCError) {
    return error.code
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code
  }
  return null
}

function createCallSignal(options: RuntimeOrpcCallOptions): {
  signal?: AbortSignal
  close: () => void
} {
  if (options.timeoutMs === undefined) {
    return { signal: options.signal, close: () => {} }
  }
  const controller = new AbortController()
  const timeout = setTimeout(
    () => {
      const error = new Error('Runtime oRPC request timed out.')
      error.name = 'TimeoutError'
      controller.abort(error)
    },
    Math.max(1, options.timeoutMs)
  )
  const onAbort = (): void => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) {
    onAbort()
  } else {
    options.signal?.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    close: () => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }
}
