import type { SpoolRequesterControlState } from '../../shared/spool/spool-access-contract'

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
    return hasOnlyKeys(record, ['worktreeRef', 'status'])
      ? { worktreeRef, status: record.status }
      : null
  }
  return record.status === 'granted' &&
    hasOnlyKeys(record, ['worktreeRef', 'status', 'approvedAt']) &&
    typeof record.approvedAt === 'number' &&
    Number.isSafeInteger(record.approvedAt) &&
    record.approvedAt >= 0
    ? { worktreeRef, status: record.status, approvedAt: record.approvedAt }
    : null
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowed.has(key))
  )
}
