import type { SpoolRpcFailure } from '../../shared/spool/spool-wire-contract'

export type SpoolExecutionErrorCode = SpoolRpcFailure['error']['code']
export type SpoolExecutionErrorDiagnostic =
  | 'session-live-read'
  | 'session-provenance'
  | 'session-consistency'
  | 'session-history-read'
  | 'session-projection'
  | 'session-cache'
  | 'session-publication'
  | 'session-chain'
  | 'session-wire-projection'
  | 'session-references'

export class SpoolExecutionError extends Error {
  constructor(
    readonly code: SpoolExecutionErrorCode,
    readonly diagnostic: SpoolExecutionErrorDiagnostic | null = null
  ) {
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
