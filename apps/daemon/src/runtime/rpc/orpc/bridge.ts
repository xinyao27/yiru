import { randomUUID } from 'node:crypto'

import { encodeRuntimeOrpcSideChannelBinaryFrame } from '@yiru/runtime-protocol/orpc-peer-frame'
import {
  withBrowserUiRuntimeRpcSource,
  YIRU_RUNTIME_RPC_BROWSER_UI_SOURCE
} from '@yiru/runtime-protocol/workbench/runtime-rpc-feature-interaction-source'
import { emulatorProbe, emulatorProbeError } from '~main/emulator/probe'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import {
  InvalidArgumentError,
  ZodError,
  formatZodError,
  type RpcContext,
  type RpcFailure,
  type RpcRequest
} from '../core'
import {
  computerErrorData,
  errorResponse,
  mapBrowserError,
  mapEmulatorError,
  mapRuntimeError
} from '../errors'
import { recordRuntimeFeatureInteraction } from '../feature-interaction'
import { orchestrationMigrationFence } from '../orchestration-contract-fence'
import { orchestrationMutationExecutorFor } from '../orchestration-mutation-executor'
import { throwRuntimeOrpcFailure } from './failure'

type RuntimeOrpcServices = Pick<
  RpcContext,
  | 'runtime'
  | 'fileCommands'
  | 'gitCommands'
  | 'emulatorCommands'
  | 'mobileNotifications'
  | 'mobileDevelopmentPairing'
  | 'workspaceEventLog'
>

type RuntimeOrpcConnectionState = Pick<
  RpcContext,
  | 'principal'
  | 'connectionId'
  | 'clientId'
  | 'clientKind'
  | 'grantedAccess'
  | 'sendBinary'
  | 'registerBinaryStreamHandler'
  | 'openTerminalMultiplex'
  | 'allowUnadvertisedTerminalMultiplex'
  | 'activateTerminalMultiplexEpoch'
  | 'closeTerminalMultiplexConnection'
  | 'terminalMultiplexQueueBytes'
  | 'authenticatedCallerFingerprint'
  | 'shellConnectionId'
  | 'delegateBrowserCommand'
>

export type RuntimeOrpcInvocationDetails = {
  method: string
  input: unknown
  signal?: AbortSignal
  requestId?: string
}

export type RuntimeOrpcInvocationMetadata = {
  hasBinarySideChannel?: boolean
  featureInteractionSource?: string
  requestId?: string
  orchestrationCapability?: string
  orchestrationContractVersion?: number
  orchestrationRequestId?: string
}

export type RuntimeOrpcAdmission = Pick<
  RpcContext,
  'principal' | 'grantedAccess' | 'authenticatedCallerFingerprint'
>

export type RuntimeOrpcContextOptions = RuntimeOrpcConnectionState &
  Pick<RpcContext, 'mobileDevelopmentPairing' | 'workspaceEventLog'> & {
    resolveAdmission?: () => Promise<RuntimeOrpcAdmission> | RuntimeOrpcAdmission
    resolveInvocationMetadata?: (
      invocation: RuntimeOrpcInvocationDetails
    ) => Promise<RuntimeOrpcInvocationMetadata> | RuntimeOrpcInvocationMetadata
    beforeInvocation?: (
      invocation: RuntimeOrpcInvocationDetails
    ) => Promise<(() => void) | void> | (() => void) | void
  }

export type RuntimeOrpcContext = RuntimeOrpcServices & RuntimeOrpcContextOptions

export type RuntimeOrpcHandler<TInput, TOutput> = (
  input: TInput,
  context: RpcContext
) => Promise<TOutput> | TOutput

export type RuntimeOrpcOperation<TOutput> = (
  context: RpcContext,
  featureInteractionInput: unknown
) => Promise<TOutput> | TOutput

export function createRuntimeOrpcContext(
  runtime: YiruRuntimeService,
  options: RuntimeOrpcContextOptions = {}
): RuntimeOrpcContext {
  return {
    runtime,
    fileCommands: runtime.fileCommands,
    gitCommands: runtime.gitCommands,
    emulatorCommands: runtime.emulatorCommands,
    mobileNotifications: runtime.mobileNotifications,
    ...options
  }
}

export async function invokeRuntimeOrpcHandler<TInput, TOutput>(
  method: string,
  input: TInput,
  context: RuntimeOrpcContext,
  signal: AbortSignal | undefined,
  handler: RuntimeOrpcHandler<TInput, TOutput>
): Promise<TOutput> {
  return invokeRuntimeOrpcOperation(method, input, context, signal, (rpcContext) =>
    handler(input, rpcContext)
  )
}

export async function invokeRuntimeOrpcOperation<TInput, TOutput>(
  method: string,
  input: TInput,
  context: RuntimeOrpcContext,
  signal: AbortSignal | undefined,
  operation: RuntimeOrpcOperation<TOutput>,
  options: { recordResult?: boolean } = {}
): Promise<TOutput> {
  const requestDetails = { method, input, signal }
  const resolvedMetadata = await context.resolveInvocationMetadata?.(requestDetails)
  const metadata = {
    ...resolvedMetadata,
    requestId: resolvedMetadata?.requestId ?? randomUUID()
  }
  const featureInteractionInput = runtimeOrpcFeatureInteractionInput(input, metadata)
  const sendBinary = runtimeOrpcSendBinary(context.sendBinary, metadata)
  const invocation = { ...requestDetails, requestId: metadata.requestId }
  const release = await context.beforeInvocation?.(invocation)
  try {
    const request = runtimeOrpcRequest(method, input, metadata)
    const meta = { runtimeId: context.runtime.getRuntimeId() }
    const migrationDenial = orchestrationMigrationFence(request, meta)
    if (migrationDenial) {
      throwRuntimeOrpcFailure(migrationDenial)
    }

    const isEmulator = method.startsWith('emulator.')
    if (isEmulator) {
      emulatorProbe(`rpc ${method}`, input)
    }

    try {
      const result = await orchestrationMutationExecutorFor(context.runtime).run(
        request,
        input,
        (mutation) => {
          if (context.delegateBrowserCommand && isDelegatedBrowserMethod(method)) {
            // Why: the Chrome extension owns real browser tabs. This authenticated reverse
            // call keeps the daemon as the CLI ingress without creating a second browser.
            return context.delegateBrowserCommand(method, input) as Promise<TOutput>
          }
          return operation(
            {
              runtime: context.runtime,
              fileCommands: context.fileCommands,
              gitCommands: context.gitCommands,
              emulatorCommands: context.emulatorCommands,
              mobileNotifications: context.mobileNotifications,
              mobileDevelopmentPairing: context.mobileDevelopmentPairing,
              principal: context.principal,
              connectionId: context.connectionId,
              requestId: request.id,
              clientId: context.clientId,
              clientKind: context.clientKind,
              grantedAccess: context.grantedAccess,
              signal,
              orchestrationCapability: request.orchestrationCapability,
              orchestrationMutation: mutation?.identity,
              recordMutationReceipt: mutation?.recordReceipt,
              authenticatedCallerFingerprint: context.authenticatedCallerFingerprint,
              sendBinary,
              registerBinaryStreamHandler: context.registerBinaryStreamHandler,
              openTerminalMultiplex: context.openTerminalMultiplex,
              allowUnadvertisedTerminalMultiplex: context.allowUnadvertisedTerminalMultiplex,
              activateTerminalMultiplexEpoch: context.activateTerminalMultiplexEpoch,
              closeTerminalMultiplexConnection: context.closeTerminalMultiplexConnection,
              terminalMultiplexQueueBytes: context.terminalMultiplexQueueBytes,
              shellConnectionId: context.shellConnectionId,
              delegateBrowserCommand: context.delegateBrowserCommand
            },
            featureInteractionInput
          )
        },
        { callerFingerprint: context.authenticatedCallerFingerprint }
      )
      if (options.recordResult !== false) {
        recordRuntimeFeatureInteraction(
          context.runtime,
          method,
          result,
          undefined,
          featureInteractionInput
        )
      }
      // Why: contract-first handlers establish TOutput; the mutation wrapper can attach
      // a receipt but does not otherwise change a handler's declared result shape.
      return result as TOutput
    } catch (error) {
      if (isEmulator) {
        emulatorProbeError(`rpc ${method}`, error, { params: input })
      }
      return throwRuntimeOrpcFailure(runtimeOrpcFailure(method, request.id, meta.runtimeId, error))
    }
  } finally {
    release?.()
  }
}

function isDelegatedBrowserMethod(method: string): boolean {
  return (
    method.startsWith('browser.') &&
    !method.startsWith('browser.grab.') &&
    !method.startsWith('browser.pageControl.') &&
    !method.startsWith('browser.screencast') &&
    method !== 'browser.download' &&
    method !== 'browser.downloadCancel' &&
    method !== 'browser.exec' &&
    method !== 'browser.guestEvents.subscribe' &&
    method !== 'browser.upload'
  )
}

function runtimeOrpcSendBinary(
  sendBinary: RpcContext['sendBinary'],
  metadata: RuntimeOrpcInvocationMetadata
): RpcContext['sendBinary'] {
  const requestId = metadata.requestId
  if (!sendBinary || !metadata.hasBinarySideChannel || !requestId) {
    return sendBinary
  }
  return (payload) => sendBinary(encodeRuntimeOrpcSideChannelBinaryFrame(requestId, payload))
}

function runtimeOrpcFeatureInteractionInput(
  input: unknown,
  metadata: RuntimeOrpcInvocationMetadata
): unknown {
  return metadata.featureInteractionSource === YIRU_RUNTIME_RPC_BROWSER_UI_SOURCE
    ? withBrowserUiRuntimeRpcSource(input)
    : input
}

function runtimeOrpcRequest(
  method: string,
  input: unknown,
  metadata: RuntimeOrpcInvocationMetadata | undefined
): RpcRequest {
  return {
    id: metadata?.requestId ?? randomUUID(),
    authToken: 'authenticated_transport',
    method,
    params: input,
    orchestrationCapability: metadata?.orchestrationCapability,
    orchestrationContractVersion: metadata?.orchestrationContractVersion,
    orchestrationRequestId: metadata?.orchestrationRequestId
  }
}

function runtimeOrpcFailure(
  method: string,
  requestId: string,
  runtimeId: string,
  error: unknown
): RpcFailure {
  const meta = { runtimeId }
  if (error instanceof ZodError) {
    return errorResponse(requestId, meta, 'invalid_argument', formatZodError(error))
  }
  if (error instanceof InvalidArgumentError) {
    return errorResponse(requestId, meta, 'invalid_argument', error.message)
  }
  if (method.startsWith('browser.')) {
    return mapBrowserError(requestId, meta, error)
  }
  if (method.startsWith('emulator.')) {
    return mapEmulatorError(requestId, meta, error)
  }
  const failure = mapRuntimeError(requestId, meta, error)
  if (method.startsWith('computer.') && failure.error.code === 'invalid_argument') {
    return errorResponse(
      requestId,
      meta,
      failure.error.code,
      failure.error.message,
      computerErrorData(failure.error.code)
    )
  }
  return failure
}
