import { randomUUID } from 'node:crypto'

import {
  RUNTIME_ORPC_ORCHESTRATION_CAPABILITY_HEADER,
  RUNTIME_ORPC_ORCHESTRATION_CONTRACT_VERSION_HEADER,
  RUNTIME_ORPC_ORCHESTRATION_REQUEST_ID_HEADER,
  RUNTIME_ORPC_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'
import type { RuntimeOrchestrationEnvelope } from '@yiru/runtime-protocol/rpc-envelope'
import { findTransport, type RuntimeMetadata } from '~shared/runtime-bootstrap'

import { createRuntimeOrpcSocketLink } from './orpc-client-facade'
import type { RuntimeOrpcResponseMetadata } from './orpc-client-types'
import { RuntimeOrpcSocketPeer } from './socket-peer'
import { retainRuntimeOrpcSocketStream } from './socket-stream-lifecycle'
import { RuntimeClientError, RuntimeRpcFailureError } from './types'

export type RuntimeOrpcCallResult<TResult> = RuntimeOrpcResponseMetadata & {
  result: TResult
}

export async function sendOrpcRequest<TResult>(
  metadata: RuntimeMetadata,
  path: readonly string[],
  input: unknown,
  timeoutMs: number,
  envelope: RuntimeOrchestrationEnvelope = {},
  signal?: AbortSignal
): Promise<RuntimeOrpcCallResult<TResult>> {
  if (signal?.aborted) {
    throw abortReason(signal)
  }
  const transport = findTransport(metadata, 'unix', 'named-pipe')
  if (!transport) {
    throw new RuntimeClientError(
      'runtime_unavailable',
      'No compatible transport found in Yiru runtime metadata.'
    )
  }
  if (!metadata.authToken) {
    throw new RuntimeClientError(
      'runtime_unavailable',
      'The Yiru runtime metadata does not include an authentication token.'
    )
  }
  const authenticatedMetadata = { ...metadata, authToken: metadata.authToken }

  const requestId = randomUUID()
  const peer = new RuntimeOrpcSocketPeer(
    transport.endpoint,
    authenticatedMetadata,
    requestId,
    timeoutMs
  )
  const link = createRuntimeOrpcSocketLink(peer, requestHeaders(requestId, envelope))
  try {
    const output = await link.call(path, input, { context: {}, signal })
    const result = retainRuntimeOrpcSocketStream(
      output,
      () => peer.close(),
      (error) => runtimeOrpcRequestFailure(error, peer, signal, requestId, metadata.runtimeId)
    )
    return {
      requestId,
      runtimeId: metadata.runtimeId,
      // Why: the contract-typed outer client owns TResult; the bundled link deliberately
      // exposes unknown at this module boundary because it serves every procedure.
      result: result as TResult
    }
  } catch (error) {
    peer.close()
    throw runtimeOrpcRequestFailure(error, peer, signal, requestId, metadata.runtimeId)
  }
}

function runtimeOrpcRequestFailure(
  error: unknown,
  peer: RuntimeOrpcSocketPeer,
  signal: AbortSignal | undefined,
  requestId: string,
  runtimeId: string
): Error {
  const transportFailure = peer.transportFailure()
  if (transportFailure) {
    return transportFailure
  }
  if (signal?.aborted) {
    return abortReason(signal)
  }
  return runtimeOrpcFailure(error, requestId, runtimeId)
}

function requestHeaders(
  requestId: string,
  envelope: RuntimeOrchestrationEnvelope
): Record<string, string> {
  return {
    [RUNTIME_ORPC_REQUEST_ID_HEADER]: requestId,
    ...(envelope.orchestrationCapability
      ? {
          [RUNTIME_ORPC_ORCHESTRATION_CAPABILITY_HEADER]: envelope.orchestrationCapability
        }
      : {}),
    ...(envelope.orchestrationContractVersion !== undefined
      ? {
          [RUNTIME_ORPC_ORCHESTRATION_CONTRACT_VERSION_HEADER]: String(
            envelope.orchestrationContractVersion
          )
        }
      : {}),
    ...(envelope.orchestrationRequestId
      ? {
          [RUNTIME_ORPC_ORCHESTRATION_REQUEST_ID_HEADER]: envelope.orchestrationRequestId
        }
      : {})
  }
}

function runtimeOrpcFailure(error: unknown, requestId: string, runtimeId: string): Error {
  if (!isRecord(error)) {
    return invalidRuntimeResponse(error)
  }
  const code = typeof error.code === 'string' ? error.code : null
  const message = typeof error.message === 'string' ? error.message : null
  if (!code || !message) {
    return invalidRuntimeResponse(error)
  }
  return new RuntimeRpcFailureError({
    id: requestId,
    ok: false,
    error: {
      code,
      message,
      ...('data' in error ? { data: error.data } : {})
    },
    _meta: { runtimeId }
  })
}

function invalidRuntimeResponse(cause: unknown): RuntimeClientError {
  return new RuntimeClientError(
    'invalid_runtime_response',
    'The Yiru runtime returned an invalid response frame.',
    cause instanceof Error ? { cause: cause.message } : undefined
  )
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new RuntimeClientError('request_cancelled', 'The runtime request was cancelled.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
