import { RuntimeClientError } from './types'

export function invalidRuntimeOrpcSocketResponse(): RuntimeClientError {
  return new RuntimeClientError(
    'invalid_runtime_response',
    'The Yiru runtime returned an invalid response frame.'
  )
}

export function runtimeOrpcSocketIdentityError(
  requestId: string,
  runtimeId: string,
  expectedRequestId: string,
  expectedRuntimeId: string
): RuntimeClientError {
  if (requestId !== expectedRequestId) {
    return new RuntimeClientError(
      'invalid_runtime_response',
      'The Yiru runtime returned a mismatched response id.'
    )
  }
  if (runtimeId === expectedRuntimeId) {
    return invalidRuntimeOrpcSocketResponse()
  }
  return new RuntimeClientError(
    'runtime_unavailable',
    'The Yiru runtime changed while the request was in flight. Retry the command.'
  )
}
