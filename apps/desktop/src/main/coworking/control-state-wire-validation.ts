import type { CoworkingRequesterControlState } from '../../shared/coworking/access-contract'
import { hasExactCoworkingWireKeys } from '../../shared/coworking/exact-wire-record'

export function readRequesterControlState(
  value: unknown,
  worktreeRef: string
): CoworkingRequesterControlState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.worktreeRef !== worktreeRef) {
    return null
  }
  if (record.status === 'read-only' || record.status === 'pending') {
    return hasExactCoworkingWireKeys(record, ['worktreeRef', 'status'])
      ? { worktreeRef, status: record.status }
      : null
  }
  return record.status === 'granted' &&
    hasExactCoworkingWireKeys(record, ['worktreeRef', 'status', 'approvedAt']) &&
    typeof record.approvedAt === 'number' &&
    Number.isSafeInteger(record.approvedAt) &&
    record.approvedAt >= 0
    ? { worktreeRef, status: record.status, approvedAt: record.approvedAt }
    : null
}
