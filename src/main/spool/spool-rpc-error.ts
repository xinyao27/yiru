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
