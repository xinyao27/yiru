import { isCoworkingAgentLaunchId } from '../../../shared/coworking/agent-launch-contract'
import type {
  CoworkingDesktopCatalog,
  CoworkingProjectCatalogEntry,
  CoworkingProviderQuota,
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPage,
  CoworkingSessionCatalogPageState,
  CoworkingWorktreeCatalogEntry
} from '../../../shared/coworking/catalog-contract'
import {
  COWORKING_CATALOG_MAX_PROJECTS,
  COWORKING_CATALOG_MAX_SESSIONS_PER_WORKTREE,
  COWORKING_CATALOG_MAX_WORKTREES
} from '../../../shared/coworking/catalog-contract'
import { hasExactCoworkingWireKeys } from '../../../shared/coworking/exact-wire-record'
import { COWORKING_PROTOCOL_VERSION } from '../../../shared/coworking/wire-contract'

type CatalogCounts = { worktrees: number }

export function isCoworkingDesktopCatalog(
  value: unknown,
  ownerRuntimeId: string
): value is CoworkingDesktopCatalog {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  const counts: CatalogCounts = { worktrees: 0 }
  return (
    hasExactCoworkingWireKeys(record, [
      'protocolVersion',
      'ownerRuntimeId',
      'catalogRevision',
      'quota',
      'projects'
    ]) &&
    record.protocolVersion === COWORKING_PROTOCOL_VERSION &&
    record.ownerRuntimeId === ownerRuntimeId &&
    Number.isSafeInteger(record.catalogRevision) &&
    Array.isArray(record.quota) &&
    record.quota.length <= 2 &&
    record.quota.every(isProviderQuota) &&
    Array.isArray(record.projects) &&
    record.projects.length <= COWORKING_CATALOG_MAX_PROJECTS &&
    record.projects.every((project) => isProject(project, counts))
  )
}

function isProject(value: unknown, counts: CatalogCounts): value is CoworkingProjectCatalogEntry {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasExactCoworkingWireKeys(record, ['projectRef', 'name', 'worktrees']) &&
    isReference(record.projectRef) &&
    isLabel(record.name) &&
    Array.isArray(record.worktrees) &&
    record.worktrees.length <= COWORKING_CATALOG_MAX_WORKTREES &&
    record.worktrees.every((worktree) => isWorktree(worktree, counts))
  )
}

function isWorktree(value: unknown, counts: CatalogCounts): value is CoworkingWorktreeCatalogEntry {
  const record = asRecord(value)
  if (!record || ++counts.worktrees > COWORKING_CATALOG_MAX_WORKTREES) {
    return false
  }
  return Boolean(
    hasExactCoworkingWireKeys(record, [
      'kind',
      'worktreeRef',
      'shareEpoch',
      'name',
      'branch',
      'sessions',
      'sessionCatalog'
    ]) &&
    (record.kind === 'git' || record.kind === 'folder') &&
    isReference(record.worktreeRef) &&
    isReference(record.shareEpoch) &&
    isLabel(record.name) &&
    (record.branch === null || isLabel(record.branch)) &&
    Array.isArray(record.sessions) &&
    record.sessions.length === 0 &&
    isInitialSessionCatalogState(record.sessionCatalog)
  )
}

export function isCoworkingSessionCatalogPage(
  value: unknown,
  expected: Pick<CoworkingSessionCatalogPage, 'catalogRevision' | 'worktreeRef' | 'shareEpoch'>
): value is CoworkingSessionCatalogPage {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasExactCoworkingWireKeys(record, [
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
    record.sessions.length <= COWORKING_CATALOG_MAX_SESSIONS_PER_WORKTREE &&
    record.sessions.every(isSession) &&
    isOwnerSessionCatalogState(record.sessionCatalog)
  )
}

function isInitialSessionCatalogState(value: unknown): value is CoworkingSessionCatalogPageState {
  return isSessionCatalogState(value) && value.status === 'loading'
}

function isOwnerSessionCatalogState(value: unknown): value is CoworkingSessionCatalogPageState {
  return isSessionCatalogState(value) && value.status !== 'error'
}

function isSessionCatalogState(value: unknown): value is CoworkingSessionCatalogPageState {
  const record = asRecord(value)
  if (!record || !hasExactCoworkingWireKeys(record, ['status', 'nextCursor'])) {
    return false
  }
  if (record.status === 'loading') {
    return isReference(record.nextCursor)
  }
  return (record.status === 'complete' || record.status === 'error') && record.nextCursor === null
}

function isSession(value: unknown): value is CoworkingSessionCatalogEntry {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasExactCoworkingWireKeys(record, ['sessionRef', 'kind', 'agent', 'title']) &&
    isReference(record.sessionRef) &&
    ((record.kind === 'terminal' && record.agent === null) ||
      (record.kind === 'agent' &&
        (record.agent === null || isCoworkingAgentLaunchId(record.agent)))) &&
    isLabel(record.title)
  )
}

function isProviderQuota(value: unknown): value is CoworkingProviderQuota {
  const record = asRecord(value)
  return Boolean(
    record &&
    hasExactCoworkingWireKeys(record, [
      'provider',
      'status',
      'updatedAt',
      'fiveHour',
      'sevenDay'
    ]) &&
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
    hasExactCoworkingWireKeys(record, ['usedPercent', 'resetsAt']) &&
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
