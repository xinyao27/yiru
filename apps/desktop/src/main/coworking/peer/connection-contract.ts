export type CoworkingSink<TResult> = {
  next(value: TResult): void
  error(error: Error): void
  complete(): void
}

export type CoworkingSubscription = {
  close(): void
}

export class CoworkingPeerConnectionError extends Error {
  constructor(readonly code: 'disconnected' | 'outcome_unknown' | 'protocol_error' | 'timeout') {
    super(code)
    this.name = 'CoworkingPeerConnectionError'
  }
}
