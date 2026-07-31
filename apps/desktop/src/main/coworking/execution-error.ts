import type { CoworkingRpcFailure } from '~shared/coworking/wire-contract'

export type CoworkingExecutionErrorCode = CoworkingRpcFailure['error']['code']
export type CoworkingExecutionErrorDiagnostic =
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

export class CoworkingExecutionError extends Error {
  constructor(
    readonly code: CoworkingExecutionErrorCode,
    readonly diagnostic: CoworkingExecutionErrorDiagnostic | null = null
  ) {
    super(`coworking_execution_${code}`)
    this.name = 'CoworkingExecutionError'
  }
}

export function asCoworkingExecutionError(
  error: unknown,
  fallback: CoworkingExecutionErrorCode = 'resource_unavailable'
): CoworkingExecutionError {
  return error instanceof CoworkingExecutionError ? error : new CoworkingExecutionError(fallback)
}
