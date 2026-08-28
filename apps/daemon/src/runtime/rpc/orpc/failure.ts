import { ORPCError } from '@orpc/server'

import type { RpcFailure } from '../core'

export function throwRuntimeOrpcFailure(failure: RpcFailure): never {
  const { code, message, data } = failure.error
  throw new ORPCError(code, {
    defined: false,
    status: runtimeOrpcErrorStatus(code),
    message,
    data
  })
}

function runtimeOrpcErrorStatus(code: string): number {
  switch (code) {
    case 'invalid_argument':
    case 'bad_request':
    case 'request_too_large':
      return 400
    case 'unauthorized':
      return 401
    case 'forbidden':
      return 403
    case 'method_not_found':
      return 404
    case 'timeout':
      return 408
    case 'runtime_busy':
    case 'relay_quota_exceeded':
      return 429
    case 'unavailable_on_host':
      return 501
    case 'runtime_unavailable':
      return 503
    default:
      return 500
  }
}
