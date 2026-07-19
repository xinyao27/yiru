import type { SpoolRpcFailure } from '../../shared/spool/spool-wire-contract'
import { SpoolExecutionError } from './spool-execution-error'

export class SpoolRpcError extends Error {
  constructor(readonly code: SpoolRpcFailure['error']['code']) {
    super(code)
    this.name = 'SpoolRpcError'
  }
}

export function projectSpoolRpcErrorCode(error: unknown): SpoolRpcFailure['error']['code'] {
  if (error instanceof SpoolRpcError || error instanceof SpoolExecutionError) {
    return error.code
  }
  return 'internal_error'
}

export function projectSpoolRpcErrorMessage(error: unknown): string {
  const code = projectSpoolRpcErrorCode(error)
  if (code !== 'internal_error') {
    return code
  }
  // Why: requesters may distinguish a safe failure stage, but owner paths,
  // session identifiers, and raw exception text must never cross the wire.
  return error instanceof SpoolExecutionError && error.diagnostic
    ? `${code}:${error.diagnostic}`
    : code
}
