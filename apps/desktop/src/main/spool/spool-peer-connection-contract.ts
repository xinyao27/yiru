export type SpoolSink<TResult> = {
  next(value: TResult): void
  error(error: Error): void
  complete(): void
}

export type SpoolSubscription = {
  close(): void
}

export class SpoolPeerConnectionError extends Error {
  constructor(readonly code: 'disconnected' | 'outcome_unknown' | 'protocol_error' | 'timeout') {
    super(code)
    this.name = 'SpoolPeerConnectionError'
  }
}
