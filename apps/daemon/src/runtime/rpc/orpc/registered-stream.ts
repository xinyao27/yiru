import type { FeatureInteractionId } from '@yiru/runtime-protocol/workbench/feature-interactions'

import type { RpcContext, RpcStreamingMethod } from '../core'
import { recordRuntimeFeatureInteraction } from '../feature-interaction'
import { invokeRuntimeOrpcOperation, type RuntimeOrpcContext } from './bridge'

type RuntimeOrpcStreamOptions<TInput> = {
  context: RuntimeOrpcContext
  input: TInput
  signal?: AbortSignal
}

// Why: the emit-based shape a streaming implementation is written against —
// the direct-wiring sibling of `RuntimeOrpcHandler` (bridge.ts). Kept generic
// over TInput/TOutput so a direct handler stays type-checked end to end,
// unlike the legacy registry's erased `RpcStreamingMethod['handler']`.
export type RuntimeOrpcStreamHandler<TInput, TOutput> = (
  input: TInput,
  context: RpcContext,
  emit: (result: TOutput) => void
) => Promise<void>

export function bridgeRuntimeStream<TInput, TOutput>(
  methodName: string,
  method: RpcStreamingMethod
): (options: RuntimeOrpcStreamOptions<TInput>) => AsyncGenerator<TOutput, void, void> {
  // Why: RpcRegistry intentionally erases each legacy handler's generic signature,
  // same reasoning as `bridgeRuntimeMethod` (registered-method.ts) — the oRPC
  // contract supplies TInput/TOutput here.
  const handler = method.handler as RuntimeOrpcStreamHandler<TInput, TOutput>
  return (options) => invokeRuntimeOrpcStream(methodName, handler, options)
}

// Why: Phase 6 D-stage domains skip the legacy registry entirely — the
// contract procedure is wired straight to its implementation function, same
// split as `wireRuntimeMethod` (registered-method.ts). This still shares
// `invokeRuntimeOrpcStream` with the bridged path below, so a directly-wired
// stream keeps every cross-cutting behavior a bridged one gets: abort-signal
// composition, feature-interaction recording per emitted value, and the
// generator drain in `invokeRuntimeOrpcOperation`'s error/mutation wrapper.
export function wireRuntimeStream<TInput, TOutput>(
  methodName: string,
  handler: RuntimeOrpcStreamHandler<TInput, TOutput>
): (options: RuntimeOrpcStreamOptions<TInput>) => AsyncGenerator<TOutput, void, void> {
  return (options) => invokeRuntimeOrpcStream(methodName, handler, options)
}

async function* invokeRuntimeOrpcStream<TInput, TOutput>(
  methodName: string,
  handler: RuntimeOrpcStreamHandler<TInput, TOutput>,
  { context, input, signal }: RuntimeOrpcStreamOptions<TInput>
): AsyncGenerator<TOutput, void, void> {
  const localAbort = new AbortController()
  const invocationSignal = signal ? AbortSignal.any([signal, localAbort.signal]) : localAbort.signal
  const values: TOutput[] = []
  const interactions = new Set<FeatureInteractionId>()
  let wake: (() => void) | undefined
  let isComplete = false
  let failure: unknown
  let featureInteractionInput: unknown = input

  const emit = (value: unknown): void => {
    recordRuntimeFeatureInteraction(
      context.runtime,
      methodName,
      value,
      interactions,
      featureInteractionInput
    )
    // Why: `emit` is declared loosely (`unknown`) so both a legacy handler's
    // erased signature and a direct handler's typed `emit` can call the same
    // function — the oRPC event iterator contract is what actually supplies
    // TOutput to the consumer.
    values.push(value as TOutput)
    wake?.()
    wake = undefined
  }
  const invocation = invokeRuntimeOrpcOperation(
    methodName,
    input,
    context,
    invocationSignal,
    (rpcContext, resolvedFeatureInteractionInput) => {
      featureInteractionInput = resolvedFeatureInteractionInput
      return handler(input, rpcContext, emit)
    },
    { recordResult: false }
  )
    .catch((error: unknown) => {
      failure = error
    })
    .finally(() => {
      isComplete = true
      wake?.()
      wake = undefined
    })

  try {
    while (!isComplete || values.length > 0) {
      if (values.length > 0) {
        const [value] = values.splice(0, 1)
        yield value
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
    if (failure !== undefined) {
      throw failure
    }
  } finally {
    localAbort.abort()
    await invocation
  }
}
