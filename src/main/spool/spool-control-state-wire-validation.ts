import type { SpoolRequesterControlState } from '../../shared/spool/spool-access-contract'
import { hasExactSpoolWireKeys } from '../../shared/spool/spool-exact-wire-record'

export function readRequesterControlState(
  value: unknown,
  worktreeRef: string
): SpoolRequesterControlState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.worktreeRef !== worktreeRef) {
    return null
  }
  if (record.status === 'read-only' || record.status === 'pending') {
    return hasExactSpoolWireKeys(record, ['worktreeRef', 'status'])
      ? { worktreeRef, status: record.status }
      : null
  }
  return record.status === 'granted' &&
    hasExactSpoolWireKeys(record, ['worktreeRef', 'status', 'approvedAt']) &&
    typeof record.approvedAt === 'number' &&
    Number.isSafeInteger(record.approvedAt) &&
    record.approvedAt >= 0
    ? { worktreeRef, status: record.status, approvedAt: record.approvedAt }
    : null
}
