import type { CoworkingRpcInvocationContext } from './gateway'

export type CoworkingRpcStreamSink = {
  next(value: unknown): void
  error(error: unknown): void
  complete(): void
}

export type CoworkingRpcStream = {
  readonly kind: 'coworking-rpc-stream'
  open(
    sink: CoworkingRpcStreamSink,
    context: CoworkingRpcInvocationContext
  ): void | (() => void) | Promise<void | (() => void)>
}

export function createCoworkingRpcStream(open: CoworkingRpcStream['open']): CoworkingRpcStream {
  return { kind: 'coworking-rpc-stream', open }
}

export function isCoworkingRpcStream(value: unknown): value is CoworkingRpcStream {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<CoworkingRpcStream>
  return record.kind === 'coworking-rpc-stream' && typeof record.open === 'function'
}
