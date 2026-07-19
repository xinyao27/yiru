export const REMOTE_RUNTIME_CANCEL_REQUEST_METHOD = 'runtime.request.cancel'

export function readRemoteRuntimeCancellationRequestId(params: unknown): string | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return null
  }
  const record = params as Record<string, unknown>
  const keys = Object.keys(record)
  const requestId = record.requestId
  return keys.length === 1 && typeof requestId === 'string' && requestId.length <= 128
    ? requestId || null
    : null
}
