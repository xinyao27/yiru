import type {
  SpoolDesktopCatalog,
  SpoolProjectCatalogEntry,
  SpoolProviderQuota,
  SpoolSessionCatalogEntry,
  SpoolSessionCatalogPage,
  SpoolSessionCatalogPageState,
  SpoolWorktreeCatalogEntry
} from '../../shared/spool/spool-catalog-contract'
import {
  SPOOL_CATALOG_MAX_PROJECTS,
  SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE,
  SPOOL_CATALOG_MAX_WORKTREES
} from '../../shared/spool/spool-catalog-contract'
import { SPOOL_PROTOCOL_VERSION } from '../../shared/spool/spool-wire-contract'

type CatalogCounts = { worktrees: number }

export function isSpoolDesktopCatalog(
  value: unknown,
  ownerRuntimeId: string
): value is SpoolDesktopCatalog {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  const counts: CatalogCounts = { worktrees: 0 }
  return (
    hasOnlyKeys(record, [
      'protocolVersion',
      'ownerRuntimeId',
      'catalogRevision',
      'quota',
      'projects'
    ]) &&
    record.protocolVersion === SPOOL_PROTOCOL_VERSION &&
    record.ownerRuntimeId === ownerRuntimeId &&
    Number.isSafeInteger(record.catalogRevision) &&
    Array.isArray(record.quota) &&
    record.quota.length <= 2 &&
    record.quota.every(isProviderQuota) &&
    Array.isArray(record.projects) &&
    record.projects.length <= SPOOL_CATALOG_MAX_PROJECTS &&
    record.projects.every((project) => isProject(project, counts))
  )
}

function isProject(value: unknown, counts: CatalogCounts): value is SpoolProjectCatalogEntry {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasOnlyKeys(record, ['projectRef', 'name', 'worktrees']) &&
    isReference(record.projectRef) &&
    isLabel(record.name) &&
    Array.isArray(record.worktrees) &&
    record.worktrees.length <= SPOOL_CATALOG_MAX_WORKTREES &&
    record.worktrees.every((worktree) => isWorktree(worktree, counts))
  )
}

function isWorktree(value: unknown, counts: CatalogCounts): value is SpoolWorktreeCatalogEntry {
  const record = asRecord(value)
  if (!record || ++counts.worktrees > SPOOL_CATALOG_MAX_WORKTREES) {
    return false
  }
  return Boolean(
    hasOnlyKeys(record, [
      'worktreeRef',
      'shareEpoch',
      'name',
      'branch',
      'sessions',
      'sessionCatalog'
    ]) &&
    isReference(record.worktreeRef) &&
    isReference(record.shareEpoch) &&
    isLabel(record.name) &&
    (record.branch === null || isLabel(record.branch)) &&
    Array.isArray(record.sessions) &&
    record.sessions.length === 0 &&
    record.sessions.length <= SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE &&
    isOwnerSessionCatalogState(record.sessionCatalog) &&
    record.sessions.every(isSession)
  )
}

export function isSpoolSessionCatalogPage(
  value: unknown,
  expected: Pick<SpoolSessionCatalogPage, 'catalogRevision' | 'worktreeRef' | 'shareEpoch'>
): value is SpoolSessionCatalogPage {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasOnlyKeys(record, [
      'catalogRevision',
      'worktreeRef',
      'shareEpoch',
      'sessions',
      'sessionCatalog'
    ]) &&
    record.catalogRevision === expected.catalogRevision &&
    record.worktreeRef === expected.worktreeRef &&
    record.shareEpoch === expected.shareEpoch &&
    Array.isArray(record.sessions) &&
    record.sessions.length > 0 &&
    record.sessions.length <= SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE &&
    record.sessions.every(isSession) &&
    isOwnerSessionCatalogState(record.sessionCatalog) &&
    ((record.sessionCatalog as SpoolSessionCatalogPageState).status !== 'loading' ||
      record.sessions.length > 0)
  )
}

function isOwnerSessionCatalogState(value: unknown): value is SpoolSessionCatalogPageState {
  return isSessionCatalogState(value) && value.status !== 'error'
}

function isSessionCatalogState(value: unknown): value is SpoolSessionCatalogPageState {
  const record = asRecord(value)
  if (!record || !hasOnlyKeys(record, ['status', 'nextCursor'])) {
    return false
  }
  if (record.status === 'loading') {
    return isReference(record.nextCursor)
  }
  return (record.status === 'complete' || record.status === 'error') && record.nextCursor === null
}

function isSession(value: unknown): value is SpoolSessionCatalogEntry {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasOnlyKeys(record, ['sessionRef', 'provider', 'title']) &&
    isReference(record.sessionRef) &&
    (record.provider === 'claude' || record.provider === 'codex' || record.provider === 'other') &&
    isLabel(record.title)
  )
}

function isProviderQuota(value: unknown): value is SpoolProviderQuota {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasOnlyKeys(record, ['provider', 'status', 'updatedAt', 'fiveHour', 'sevenDay']) &&
    (record.provider === 'claude' || record.provider === 'codex') &&
    (record.status === 'ok' || record.status === 'unavailable') &&
    (record.updatedAt === null || isFiniteNumber(record.updatedAt)) &&
    isQuotaWindow(record.fiveHour) &&
    isQuotaWindow(record.sevenDay)
  )
}

function isQuotaWindow(value: unknown): boolean {
  if (value === null) {
    return true
  }
  const record = asRecord(value)
  return Boolean(
    record &&
    hasOnlyKeys(record, ['usedPercent', 'resetsAt']) &&
    isFiniteNumber(record.usedPercent) &&
    record.usedPercent >= 0 &&
    record.usedPercent <= 100 &&
    (record.resetsAt === null || isFiniteNumber(record.resetsAt))
  )
}

function isReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048
}

function isLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 240
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowed.has(key))
  )
}
