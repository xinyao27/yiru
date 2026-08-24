import {
  isKeepaliveFrame,
  RuntimeRpcEnvelopeSchema,
  type RuntimeRpcResponse
} from '@yiru/runtime-protocol/rpc-envelope'

import { RemoteRuntimeClientError } from './client-error'

type ParsedRemoteRuntimeResponse<TResult> =
  | { kind: 'keepalive' }
  | { kind: 'response'; response: RuntimeRpcResponse<TResult> }
  | { kind: 'error'; error: RemoteRuntimeClientError }

export function parseRemoteRuntimeResponse<TResult>(
  plaintext: string,
  requestId: string
): ParsedRemoteRuntimeResponse<TResult> {
  let raw: unknown
  try {
    raw = JSON.parse(plaintext)
  } catch {
    return {
      kind: 'error',
      error: new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an invalid response frame.'
      )
    }
  }
  if (isKeepaliveFrame(raw)) {
    return { kind: 'keepalive' }
  }
  const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
  if (!parsed.success || '_keepalive' in parsed.data) {
    return {
      kind: 'error',
      error: new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an invalid response frame.'
      )
    }
  }
  const response = parsed.data as RuntimeRpcResponse<TResult>
  if (response.id !== requestId) {
    return {
      kind: 'error',
      error: new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned a mismatched response id.'
      )
    }
  }
  return { kind: 'response', response }
}
