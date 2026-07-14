import type { SpoolRpcRequest } from '../../shared/spool/spool-wire-contract'

export function parseSpoolRpcRequest(frame: string): SpoolRpcRequest | null {
  let value: unknown
  try {
    value = JSON.parse(frame)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (
    !hasOnlyKeys(record, ['id', 'method', 'params']) ||
    !isBoundedIdentifier(record.id) ||
    !isBoundedIdentifier(record.method)
  ) {
    return null
  }
  return { id: record.id, method: record.method, params: record.params }
}

export function readSpoolSubscriptionRequestId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  return hasOnlyKeys(record, ['requestId']) && isBoundedIdentifier(record.requestId)
    ? record.requestId
    : null
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowed.has(key))
  )
}
