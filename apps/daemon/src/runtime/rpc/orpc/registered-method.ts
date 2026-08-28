import { buildRegistry, isStreamingMethod, type RpcContext } from '../core'
import { ALL_RPC_METHODS } from '../methods/catalog'
import {
  invokeRuntimeOrpcHandler,
  type RuntimeOrpcContext,
  type RuntimeOrpcHandler
} from './bridge'
import { bridgeRuntimeStream } from './registered-stream'

const RUNTIME_RPC_METHOD_REGISTRY = buildRegistry(ALL_RPC_METHODS)

type RuntimeOrpcHandlerOptions<TInput> = {
  context: RuntimeOrpcContext
  input: TInput
  signal?: AbortSignal
}

export function bridgeRuntimeMethod<TInput, TOutput>(
  methodName: string
): (options: RuntimeOrpcHandlerOptions<TInput>) => Promise<TOutput> {
  const method = RUNTIME_RPC_METHOD_REGISTRY.get(methodName)
  if (!method) {
    throw new Error(`missing_runtime_rpc_method:${methodName}`)
  }
  if (isStreamingMethod(method)) {
    throw new Error(`streaming_runtime_rpc_method:${methodName}`)
  }

  // Why: RpcRegistry intentionally erases each legacy handler's generic signature.
  // The oRPC contract validates input and supplies the contextual output type here.
  const handler = ((input: TInput, context: RpcContext) =>
    method.handler(input, context)) as RuntimeOrpcHandler<TInput, TOutput>

  return ({ context, input, signal }) =>
    invokeRuntimeOrpcHandler(methodName, input, context, signal, handler).then((result) =>
      decorateRuntimeMethodResult(methodName, result, context)
    )
}

// Why: Phase 6 D-stage domains skip the legacy registry entirely — the
// contract procedure is wired straight to its implementation function. This
// still routes through `invokeRuntimeOrpcHandler` so a directly-wired
// procedure keeps every cross-cutting behavior a bridged one gets (error
// mapping, feature-interaction recording, redirected-project-access checks,
// orchestration mutation receipts, and — same as `bridgeRuntimeMethod` below —
// the `status.get` paired-device decoration, needed once `status` itself
// moved to direct wiring, docs/runtime-orpc-migration.md Phase 6 slice 110).
export function wireRuntimeMethod<TInput, TOutput>(
  methodName: string,
  handler: RuntimeOrpcHandler<TInput, TOutput>
): (options: RuntimeOrpcHandlerOptions<TInput>) => Promise<TOutput> {
  return ({ context, input, signal }) =>
    invokeRuntimeOrpcHandler(methodName, input, context, signal, handler).then((result) =>
      decorateRuntimeMethodResult(methodName, result, context)
    )
}

export function bridgeRuntimeProcedure<TInput, TOutput>(
  methodName: string
): (
  options: RuntimeOrpcHandlerOptions<TInput>
) => Promise<TOutput> | AsyncGenerator<TOutput, void, void> {
  const method = RUNTIME_RPC_METHOD_REGISTRY.get(methodName)
  if (!method) {
    throw new Error(`missing_runtime_rpc_method:${methodName}`)
  }
  return isStreamingMethod(method)
    ? bridgeRuntimeStream<TInput, TOutput>(methodName, method)
    : bridgeRuntimeMethod<TInput, TOutput>(methodName)
}

function decorateRuntimeMethodResult<TOutput>(
  methodName: string,
  result: TOutput,
  context: RuntimeOrpcContext
): TOutput {
  if (
    methodName !== 'status.get' ||
    context.principal?.kind !== 'paired-device' ||
    !isRecord(result)
  ) {
    return result
  }
  // Why: legacy status replies gain the authenticated pairing scope at the
  // transport boundary. oRPC bypasses that envelope hook, so the bridge owns it.
  return { ...result, deviceScope: context.principal.scope } as TOutput
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
