import type { CoworkingRpcFailure } from '~shared/coworking/wire-contract'

import { CoworkingExecutionError } from '../execution-error'

export class CoworkingRpcError extends Error {
  constructor(readonly code: CoworkingRpcFailure['error']['code']) {
    super(code)
    this.name = 'CoworkingRpcError'
  }
}

export function projectCoworkingRpcErrorCode(error: unknown): CoworkingRpcFailure['error']['code'] {
  if (error instanceof CoworkingRpcError || error instanceof CoworkingExecutionError) {
    return error.code
  }
  return 'internal_error'
}

export function projectCoworkingRpcErrorMessage(error: unknown): string {
  const code = projectCoworkingRpcErrorCode(error)
  if (code !== 'internal_error') {
    return code
  }
  // Why: requesters may distinguish a safe failure stage, but owner paths,
  // session identifiers, and raw exception text must never cross the wire.
  return error instanceof CoworkingExecutionError && error.diagnostic
    ? `${code}:${error.diagnostic}`
    : code
}
