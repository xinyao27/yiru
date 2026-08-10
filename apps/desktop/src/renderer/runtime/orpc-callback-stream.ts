import { ORPCError } from '@orpc/client'
import { translate } from '~renderer/i18n/i18n'

import type { RuntimeOrpcBinaryListener } from './orpc-binary-side-channel'
import {
  callRuntimeOrpc,
  type RuntimeClientTarget,
  type RuntimeOrpcCallOptions
} from './orpc-client'
import type { RuntimeOrpcClient } from './orpc-message-port-client'

export type RuntimeOrpcStreamResponse<TResult> =
  | { ok: true; result: TResult }
  | { ok: false; error: { code: string; message: string } }

export type RuntimeOrpcStreamCallbacks<TResult> = {
  onResponse: (response: RuntimeOrpcStreamResponse<TResult>) => void
  onBinary?: RuntimeOrpcBinaryListener
  onError?: (error: { code: string; message: string }) => void
  onClose?: () => void
}

export type RuntimeOrpcStreamSubscription = { unsubscribe: () => void }

type RuntimeOrpcStreamProcedure<TInput, TResult> = (
  input: TInput,
  options?: {
    signal?: AbortSignal
    context?: { onBinary?: RuntimeOrpcBinaryListener }
  }
) => Promise<AsyncIterable<TResult>>

// Why: `browser.screencast.subscribe` is the one call site still shaped like
// `window.api.runtimeEnvironments.subscribe`'s callback API
// (onResponse/onBinary/onError/onClose) rather than a for-await loop over an
// event iterator. Wrapping `callRuntimeOrpc` here — instead of rewriting the
// call site around iteration — keeps the diff to "which transport", not "how
// the caller consumes the stream".
export async function subscribeRuntimeOrpcStream<TInput, TResult>(
  target: RuntimeClientTarget,
  selectProcedure: (client: RuntimeOrpcClient) => RuntimeOrpcStreamProcedure<TInput, TResult>,
  input: TInput,
  callbacks: RuntimeOrpcStreamCallbacks<TResult>,
  options: RuntimeOrpcCallOptions = {}
): Promise<RuntimeOrpcStreamSubscription> {
  const controller = new AbortController()
  const forwardAbort = (): void => controller.abort(options.signal?.reason)
  if (options.signal) {
    if (options.signal.aborted) {
      forwardAbort()
    } else {
      options.signal.addEventListener('abort', forwardAbort, { once: true })
    }
  }
  const subscription: RuntimeOrpcStreamSubscription = {
    unsubscribe: () => {
      options.signal?.removeEventListener('abort', forwardAbort)
      controller.abort()
    }
  }
  const iterable = await callRuntimeOrpc(target, selectProcedure, input, {
    ...options,
    signal: controller.signal,
    onBinary: callbacks.onBinary
  })
  // Why: intentionally not awaited — the caller gets the subscription handle
  // back once the stream is established, same as the legacy bare channel's
  // `Promise<RuntimeEnvironmentSubscriptionHandle>`. Events keep arriving via
  // `onResponse` for the subscription's lifetime.
  void consumeRuntimeOrpcStream(iterable, callbacks, controller.signal)
  return subscription
}

async function consumeRuntimeOrpcStream<TResult>(
  iterable: AsyncIterable<TResult>,
  callbacks: RuntimeOrpcStreamCallbacks<TResult>,
  signal: AbortSignal
): Promise<void> {
  try {
    for await (const value of iterable) {
      if (signal.aborted) {
        return
      }
      callbacks.onResponse({ ok: true, result: value })
    }
    callbacks.onClose?.()
  } catch (error) {
    if (signal.aborted) {
      callbacks.onClose?.()
      return
    }
    callbacks.onError?.(normalizeRuntimeOrpcStreamError(error))
  }
}

function normalizeRuntimeOrpcStreamError(error: unknown): { code: string; message: string } {
  if (error instanceof ORPCError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { code: 'runtime_error', message: error.message }
  }
  return {
    code: 'runtime_error',
    message: translate('auto.runtime.orpcCallbackStream.streamFailed', 'Runtime stream failed.')
  }
}
