import type { SpoolRpcFailure } from '../../shared/spool/spool-wire-contract'

export type SpoolExecutionErrorCode = SpoolRpcFailure['error']['code']

export class SpoolExecutionError extends Error {
  constructor(readonly code: SpoolExecutionErrorCode) {
    super(`spool_execution_${code}`)
    this.name = 'SpoolExecutionError'
  }
}

export function asSpoolExecutionError(
  error: unknown,
  fallback: SpoolExecutionErrorCode = 'resource_unavailable'
): SpoolExecutionError {
  return error instanceof SpoolExecutionError ? error : new SpoolExecutionError(fallback)
}
