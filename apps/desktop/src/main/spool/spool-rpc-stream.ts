import type { SpoolRpcInvocationContext } from './spool-rpc-gateway'

export type SpoolRpcStreamSink = {
  next(value: unknown): void
  error(error: unknown): void
  complete(): void
}

export type SpoolRpcStream = {
  readonly kind: 'spool-rpc-stream'
  open(
    sink: SpoolRpcStreamSink,
    context: SpoolRpcInvocationContext
  ): void | (() => void) | Promise<void | (() => void)>
}

export function createSpoolRpcStream(open: SpoolRpcStream['open']): SpoolRpcStream {
  return { kind: 'spool-rpc-stream', open }
}

export function isSpoolRpcStream(value: unknown): value is SpoolRpcStream {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<SpoolRpcStream>
  return record.kind === 'spool-rpc-stream' && typeof record.open === 'function'
}
