import { hasExactCoworkingWireKeys } from '~shared/coworking/exact-wire-record'
import type { CoworkingRpcRequest } from '~shared/coworking/wire-contract'

export function parseCoworkingRpcRequest(frame: string): CoworkingRpcRequest | null {
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
    !hasExactCoworkingWireKeys(record, ['id', 'method', 'params']) ||
    !isBoundedIdentifier(record.id) ||
    !isBoundedIdentifier(record.method)
  ) {
    return null
  }
  return { id: record.id, method: record.method, params: record.params }
}

export function readCoworkingCancellationRequestId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  return hasExactCoworkingWireKeys(record, ['requestId']) && isBoundedIdentifier(record.requestId)
    ? record.requestId
    : null
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}
