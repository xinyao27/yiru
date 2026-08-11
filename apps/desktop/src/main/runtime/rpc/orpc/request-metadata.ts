import type { RPCHandlerOptions } from '@orpc/server/message-port'
import {
  RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER,
  RUNTIME_ORPC_FEATURE_INTERACTION_SOURCE_HEADER,
  RUNTIME_ORPC_ORCHESTRATION_CAPABILITY_HEADER,
  RUNTIME_ORPC_ORCHESTRATION_CONTRACT_VERSION_HEADER,
  RUNTIME_ORPC_ORCHESTRATION_REQUEST_ID_HEADER,
  RUNTIME_ORPC_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'

import type { RuntimeOrpcContext, RuntimeOrpcInvocationMetadata } from './bridge'

export type RuntimeOrpcHandlerHooks = {
  isProcedureMounted?: (path: readonly string[]) => boolean
  onError?: (error: unknown, path: readonly string[]) => void
  onUnmatchedProcedure?: (details: {
    context: RuntimeOrpcContext
    path: readonly string[]
    requestId?: string
  }) => Promise<never> | never
}

export function createRuntimeOrpcHandlerOptions({
  isProcedureMounted,
  onError,
  onUnmatchedProcedure
}: RuntimeOrpcHandlerHooks = {}): RPCHandlerOptions<RuntimeOrpcContext> {
  const interceptors: NonNullable<RPCHandlerOptions<RuntimeOrpcContext>['interceptors']> = []
  if (onUnmatchedProcedure) {
    interceptors.push(async ({ context, next, request, ...options }) => {
      const path = request.url.pathname.split('/').filter(Boolean)
      if (isProcedureMounted && !isProcedureMounted(path)) {
        await onUnmatchedProcedure({
          context,
          path,
          requestId: firstHeader(request.headers[RUNTIME_ORPC_REQUEST_ID_HEADER])
        })
      }
      const result = await next({ ...options, context, request })
      if (!result.matched) {
        await onUnmatchedProcedure({
          context,
          path,
          requestId: firstHeader(request.headers[RUNTIME_ORPC_REQUEST_ID_HEADER])
        })
      }
      return result
    })
  }
  interceptors.push(({ context, next, request, ...options }) => {
    const headerMetadata = runtimeOrpcInvocationMetadata(request.headers)
    return next({
      ...options,
      request,
      context: {
        runtime: context.runtime,
        fileCommands: context.fileCommands,
        gitCommands: context.gitCommands,
        get browserCommands() {
          return context.browserCommands
        },
        emulatorCommands: context.emulatorCommands,
        mobileNotifications: context.mobileNotifications,
        mobileDevelopmentPairing: context.mobileDevelopmentPairing,
        principal: context.principal,
        connectionId: context.connectionId,
        clientId: context.clientId,
        clientKind: context.clientKind,
        grantedAccess: context.grantedAccess,
        sendBinary: context.sendBinary,
        registerBinaryStreamHandler: context.registerBinaryStreamHandler,
        authenticatedCallerFingerprint: context.authenticatedCallerFingerprint,
        shellConnectionId: context.shellConnectionId,
        renderingWebContentsId: context.renderingWebContentsId,
        resolveAdmission: context.resolveAdmission,
        beforeInvocation: context.beforeInvocation,
        resolveInvocationMetadata: async (invocation) => ({
          ...(await context.resolveInvocationMetadata?.(invocation)),
          ...headerMetadata
        })
      }
    })
  })
  return {
    clientInterceptors: onError
      ? [
          async (options) => {
            try {
              const output = await options.next()
              return reportRuntimeOrpcStreamErrors(output, (error) => onError(error, options.path))
            } catch (error) {
              onError(error, options.path)
              throw error
            }
          }
        ]
      : undefined,
    interceptors
  }
}

function reportRuntimeOrpcStreamErrors(output: unknown, report: (error: unknown) => void): unknown {
  return isAsyncIterable(output) ? reportStreamErrors(output, report) : output
}

async function* reportStreamErrors(
  output: AsyncIterable<unknown>,
  report: (error: unknown) => void
): AsyncGenerator<unknown, unknown, void> {
  try {
    return yield* output
  } catch (error) {
    report(error)
    throw error
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}

function runtimeOrpcInvocationMetadata(
  headers: Record<string, string | string[] | undefined>
): RuntimeOrpcInvocationMetadata {
  const contractVersion = Number(
    firstHeader(headers[RUNTIME_ORPC_ORCHESTRATION_CONTRACT_VERSION_HEADER])
  )
  return {
    hasBinarySideChannel: firstHeader(headers[RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER]) === '1',
    featureInteractionSource: firstHeader(headers[RUNTIME_ORPC_FEATURE_INTERACTION_SOURCE_HEADER]),
    requestId: firstHeader(headers[RUNTIME_ORPC_REQUEST_ID_HEADER]),
    orchestrationCapability: firstHeader(headers[RUNTIME_ORPC_ORCHESTRATION_CAPABILITY_HEADER]),
    orchestrationContractVersion: Number.isSafeInteger(contractVersion)
      ? contractVersion
      : undefined,
    orchestrationRequestId: firstHeader(headers[RUNTIME_ORPC_ORCHESTRATION_REQUEST_ID_HEADER])
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first?.trim() || undefined
}
