import type { SpoolRpcRequest } from '../../shared/spool/spool-wire-contract'
import { hasExactSpoolWireKeys } from '../../shared/spool/spool-exact-wire-record'

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
    !hasExactSpoolWireKeys(record, ['id', 'method', 'params']) ||
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
  return hasExactSpoolWireKeys(record, ['requestId']) && isBoundedIdentifier(record.requestId)
    ? record.requestId
    : null
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}
