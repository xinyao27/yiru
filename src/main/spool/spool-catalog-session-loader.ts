import type { SpoolDesktopCatalog } from '../../shared/spool/spool-catalog-contract'
import type { SpoolDesktopRecord } from './spool-desktop-record'
import type { SpoolPeerConnection } from './spool-peer-connection'
import {
  markSpoolCatalogSessionLoadError,
  materializeSpoolCatalogSessions
} from './spool-catalog-session-materializer'

const INITIAL_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 30_000

type SpoolCatalogSessionLoadOptions = {
  record: SpoolDesktopRecord
  connection: SpoolPeerConnection
  catalog: SpoolDesktopCatalog
  isConnected(): boolean
  onCatalogChanged(): void
}

export function reconcileSpoolCatalogSessionLoad(options: SpoolCatalogSessionLoadOptions): void {
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
  cancelRetryTimer(record)
  record.catalogLoadIdentity = loadIdentity
  record.catalogRetryAttempt = 0
  startMaterialization(options, previousCatalog, loadIdentity)
}

export function cancelSpoolCatalogSessionLoad(record: SpoolDesktopRecord): void {
  record.catalogLoadGeneration++
  record.catalogLoadIdentity = null
  record.catalogRetryAttempt = 0
  cancelRetryTimer(record)
}

function startMaterialization(
  options: SpoolCatalogSessionLoadOptions,
  previousCatalog: SpoolDesktopCatalog | null,
  loadIdentity: string
): void {
  const { record, connection, catalog } = options
  const loadGeneration = ++record.catalogLoadGeneration
  const isCurrent = (): boolean =>
    options.isConnected() &&
    record.catalogLoadIdentity === loadIdentity &&
    record.catalogLoadGeneration === loadGeneration
  void materializeSpoolCatalogSessions({
    baseCatalog: catalog,
    previousCatalog,
    connection,
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
  }).then(
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
      record.catalog = markSpoolCatalogSessionLoadError(record.catalog)
      options.onCatalogChanged()
      scheduleRetry(options, loadIdentity)
    }
  )
}

function scheduleRetry(options: SpoolCatalogSessionLoadOptions, loadIdentity: string): void {
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

function cancelRetryTimer(record: SpoolDesktopRecord): void {
  if (!record.catalogRetryTimer) {
    return
  }
  clearTimeout(record.catalogRetryTimer)
  record.catalogRetryTimer = null
}

function catalogSessionLoadIdentity(catalog: SpoolDesktopCatalog): string {
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
