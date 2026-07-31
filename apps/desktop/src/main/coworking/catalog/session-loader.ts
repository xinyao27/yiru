import type { CoworkingDesktopCatalog } from '~shared/coworking/catalog-contract'

import type { CoworkingOwnerRecord } from '../owner/record'
import type { CoworkingPeerConnection } from '../peer/connection'
import {
  markCoworkingCatalogSessionLoadError,
  materializeCoworkingCatalogSessions
} from './session-materializer'

const INITIAL_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 30_000

type CoworkingCatalogSessionLoadOptions = {
  record: CoworkingOwnerRecord
  connection: CoworkingPeerConnection
  catalog: CoworkingDesktopCatalog
  isConnected(): boolean
  onCatalogChanged(): void
}

export function reconcileCoworkingCatalogSessionLoad(
  options: CoworkingCatalogSessionLoadOptions
): void {
  const { record, catalog } = options
  const previousCatalog = record.catalog
  const loadIdentity = catalogSessionLoadIdentity(catalog)
  if (record.catalogLoadIdentity === loadIdentity && previousCatalog) {
    // Why: quota-only snapshots retain the exact base cursor chain; keep an
    // in-flight, failed, or completed materialization and its retry schedule.
    record.catalog = { ...previousCatalog, quota: catalog.quota }
    options.onCatalogChanged()
    return
  }
  abortActiveLoad(record)
  cancelRetryTimer(record)
  record.catalogLoadIdentity = loadIdentity
  record.catalogRetryAttempt = 0
  startMaterialization(options, previousCatalog, loadIdentity)
}

export function cancelCoworkingCatalogSessionLoad(record: CoworkingOwnerRecord): void {
  record.catalogLoadGeneration++
  record.catalogLoadIdentity = null
  record.catalogRetryAttempt = 0
  abortActiveLoad(record)
  cancelRetryTimer(record)
}

function startMaterialization(
  options: CoworkingCatalogSessionLoadOptions,
  previousCatalog: CoworkingDesktopCatalog | null,
  loadIdentity: string
): void {
  const { record, connection, catalog } = options
  abortActiveLoad(record)
  const abort = new AbortController()
  record.catalogLoadAbort = abort
  const loadGeneration = ++record.catalogLoadGeneration
  const isCurrent = (): boolean =>
    !abort.signal.aborted &&
    options.isConnected() &&
    record.catalogLoadIdentity === loadIdentity &&
    record.catalogLoadGeneration === loadGeneration
  void materializeCoworkingCatalogSessions({
    baseCatalog: catalog,
    previousCatalog,
    connection,
    signal: abort.signal,
    isCurrent,
    publish: (materialized) => {
      if (!isCurrent()) {
        return
      }
      const quota =
        record.catalog?.catalogRevision === materialized.catalogRevision
          ? record.catalog.quota
          : materialized.quota
      record.catalog = { ...materialized, quota }
      options.onCatalogChanged()
    }
  })
    .then(
      (result) => {
        if (!isCurrent()) {
          return
        }
        if (result === 'error') {
          scheduleRetry(options, loadIdentity)
        } else if (result === 'complete') {
          record.catalogRetryAttempt = 0
        }
      },
      () => {
        if (!isCurrent() || !record.catalog) {
          return
        }
        record.catalog = markCoworkingCatalogSessionLoadError(record.catalog)
        options.onCatalogChanged()
        scheduleRetry(options, loadIdentity)
      }
    )
    .finally(() => {
      if (record.catalogLoadAbort === abort) {
        record.catalogLoadAbort = null
      }
    })
}

function scheduleRetry(options: CoworkingCatalogSessionLoadOptions, loadIdentity: string): void {
  const { record } = options
  if (record.catalogRetryTimer || record.catalogLoadIdentity !== loadIdentity) {
    return
  }
  const delay = Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** record.catalogRetryAttempt,
    MAX_RETRY_DELAY_MS
  )
  record.catalogRetryAttempt++
  record.catalogRetryTimer = setTimeout(() => {
    record.catalogRetryTimer = null
    if (!options.isConnected() || record.catalogLoadIdentity !== loadIdentity) {
      return
    }
    startMaterialization(options, record.catalog, loadIdentity)
  }, delay)
  record.catalogRetryTimer.unref()
}

function cancelRetryTimer(record: CoworkingOwnerRecord): void {
  if (!record.catalogRetryTimer) {
    return
  }
  clearTimeout(record.catalogRetryTimer)
  record.catalogRetryTimer = null
}

function abortActiveLoad(record: CoworkingOwnerRecord): void {
  record.catalogLoadAbort?.abort()
  record.catalogLoadAbort = null
}

function catalogSessionLoadIdentity(catalog: CoworkingDesktopCatalog): string {
  return JSON.stringify({
    catalogRevision: catalog.catalogRevision,
    worktrees: catalog.projects.flatMap((project) =>
      project.worktrees.map((worktree) => ({
        worktreeRef: worktree.worktreeRef,
        shareEpoch: worktree.shareEpoch,
        status: worktree.sessionCatalog.status,
        cursor: worktree.sessionCatalog.nextCursor
      }))
    )
  })
}
