import type {
  SpoolDesktopCatalog,
  SpoolSessionCatalogEntry,
  SpoolWorktreeCatalogEntry
} from '../../shared/spool/spool-catalog-contract'
import { SPOOL_SESSION_PAGE_REQUEST_TIMEOUT_MS } from '../../shared/spool/spool-resource-limits'
import { isSpoolSessionCatalogPage } from './spool-catalog-wire-validation'
import { SpoolCatalogSessionBudget, spoolCatalogSessionBytes } from './spool-catalog-session-budget'
import type { SpoolPeerConnection } from './spool-peer-connection'

// Why: the owner inventory is capped at 50k historical rows plus 5k live rows.
const MAX_MATERIALIZED_SESSIONS_PER_WORKTREE = 55_000
// Why: honest scanners consume about 512 candidates per wire page; this leaves retry headroom.
const MAX_SESSION_CATALOG_PAGES = 128
// Why: malformed candidates can yield empty pages, but a peer cannot stream them indefinitely.
const MAX_CONSECUTIVE_EMPTY_SESSION_PAGES = 112
const MAX_MATERIALIZED_SESSION_BYTES = 64 * 1024 * 1024

type MaterializeSpoolCatalogSessionsOptions = {
  baseCatalog: SpoolDesktopCatalog
  previousCatalog: SpoolDesktopCatalog | null
  connection: SpoolPeerConnection
  signal: AbortSignal
  isCurrent(): boolean
  publish(catalog: SpoolDesktopCatalog): void
}

export async function materializeSpoolCatalogSessions(
  options: MaterializeSpoolCatalogSessionsOptions
): Promise<'complete' | 'error' | 'cancelled'> {
  const seeded = seedLoadingSessions(options.baseCatalog, options.previousCatalog)
  let catalog = seeded.catalog
  options.publish(catalog)
  for (const project of options.baseCatalog.projects) {
    for (const worktree of project.worktrees) {
      if (!options.isCurrent()) {
        return 'cancelled'
      }
      const materialized = findWorktree(catalog, worktree)
      if (materialized?.sessionCatalog.status !== 'loading') {
        continue
      }
      catalog = await materializeWorktree(options, catalog, worktree, seeded.budget)
    }
  }
  if (!options.isCurrent()) {
    return 'cancelled'
  }
  return catalog.projects.some((project) =>
    project.worktrees.some((worktree) => worktree.sessionCatalog.status === 'error')
  )
    ? 'error'
    : 'complete'
}

export function markSpoolCatalogSessionLoadError(
  catalog: SpoolDesktopCatalog
): SpoolDesktopCatalog {
  return {
    ...catalog,
    projects: catalog.projects.map((project) => ({
      ...project,
      worktrees: project.worktrees.map((worktree) =>
        worktree.sessionCatalog.status === 'loading'
          ? { ...worktree, sessionCatalog: { status: 'error', nextCursor: null } }
          : worktree
      )
    }))
  }
}

async function materializeWorktree(
  options: MaterializeSpoolCatalogSessionsOptions,
  initialCatalog: SpoolDesktopCatalog,
  worktree: SpoolWorktreeCatalogEntry,
  budget: SpoolCatalogSessionBudget
): Promise<SpoolDesktopCatalog> {
  let catalog = initialCatalog
  let cursor = worktree.sessionCatalog.nextCursor
  const loaded: SpoolSessionCatalogEntry[] = []
  const loadedRefs = new Set<string>()
  const cursors = new Set<string>()
  let consecutiveEmptyPages = 0
  let loadedBytes = 0
  try {
    while (cursor) {
      if (cursors.has(cursor)) {
        throw new Error('spool_catalog_session_cursor_repeated')
      }
      if (cursors.size >= MAX_SESSION_CATALOG_PAGES) {
        throw new Error('spool_catalog_session_page_limit_exceeded')
      }
      cursors.add(cursor)
      const value = await options.connection.request<unknown>(
        'catalog.sessions.page',
        {
          worktreeRef: worktree.worktreeRef,
          shareEpoch: worktree.shareEpoch,
          catalogRevision: options.baseCatalog.catalogRevision,
          cursor
        },
        { signal: options.signal, timeoutMs: SPOOL_SESSION_PAGE_REQUEST_TIMEOUT_MS }
      )
      if (!options.isCurrent()) {
        return catalog
      }
      if (
        !isSpoolSessionCatalogPage(value, {
          catalogRevision: options.baseCatalog.catalogRevision,
          worktreeRef: worktree.worktreeRef,
          shareEpoch: worktree.shareEpoch
        })
      ) {
        throw new Error('invalid_spool_catalog_session_page')
      }
      consecutiveEmptyPages = value.sessions.length === 0 ? consecutiveEmptyPages + 1 : 0
      if (
        loaded.length + value.sessions.length > MAX_MATERIALIZED_SESSIONS_PER_WORKTREE ||
        consecutiveEmptyPages > MAX_CONSECUTIVE_EMPTY_SESSION_PAGES
      ) {
        throw new Error('spool_catalog_session_capacity_exceeded')
      }
      for (const session of value.sessions) {
        if (loadedRefs.has(session.sessionRef)) {
          throw new Error('duplicate_spool_catalog_session_ref')
        }
        loadedRefs.add(session.sessionRef)
        loadedBytes += spoolCatalogSessionBytes(session)
        if (loadedBytes > MAX_MATERIALIZED_SESSION_BYTES) {
          throw new Error('spool_catalog_session_byte_limit_exceeded')
        }
        loaded.push(session)
      }
      const publishedSessions = [...loaded]
      const previousSessions = findWorktree(catalog, worktree)?.sessions ?? []
      budget.replace(previousSessions, publishedSessions)
      catalog = replaceWorktree(catalog, worktree.worktreeRef, {
        ...worktree,
        sessions: publishedSessions,
        sessionCatalog: value.sessionCatalog
      })
      options.publish(catalog)
      if (value.sessionCatalog.status !== 'loading') {
        return catalog
      }
      cursor = value.sessionCatalog.nextCursor
    }
    throw new Error('missing_spool_catalog_session_cursor')
  } catch {
    if (!options.isCurrent()) {
      return catalog
    }
    // Why: a partial fetch must remain visibly incomplete; it must never be
    // mistaken for the complete session set promised by a Public worktree.
    const retainedSessions = findWorktree(catalog, worktree)?.sessions ?? []
    catalog = replaceWorktree(catalog, worktree.worktreeRef, {
      ...worktree,
      sessions: retainedSessions,
      sessionCatalog: { status: 'error', nextCursor: null }
    })
    options.publish(catalog)
    return catalog
  }
}

function seedLoadingSessions(
  catalog: SpoolDesktopCatalog,
  previous: SpoolDesktopCatalog | null
): { catalog: SpoolDesktopCatalog; budget: SpoolCatalogSessionBudget } {
  const budget = new SpoolCatalogSessionBudget()
  const seeded = {
    ...catalog,
    projects: catalog.projects.map((project) => ({
      ...project,
      worktrees: project.worktrees.map((worktree) => {
        if (worktree.sessionCatalog.status !== 'loading') {
          if (!budget.retain(worktree.sessions)) {
            return { ...worktree, sessions: [] }
          }
          return worktree
        }
        const previousWorktree = findWorktree(previous, worktree)
        if (
          previous?.catalogRevision === catalog.catalogRevision &&
          previousWorktree?.sessionCatalog.status === 'complete'
        ) {
          // Why: catalogRevision excludes quota-only changes, so a completed
          // worktree can keep its full materialized set without another crawl.
          if (budget.retain(previousWorktree.sessions)) {
            return { ...previousWorktree, sessions: [...previousWorktree.sessions] }
          }
          return worktree
        }
        // Why: session refs are revision-bound; retaining them across a new catalog leaves
        // requester rows visible after the owner has already invalidated their bindings.
        const retained =
          previous?.catalogRevision === catalog.catalogRevision
            ? (previousWorktree?.sessions ?? [])
            : []
        return budget.retain(retained) ? { ...worktree, sessions: [...retained] } : worktree
      })
    }))
  }
  return { catalog: seeded, budget }
}

function findWorktree(
  catalog: SpoolDesktopCatalog | null,
  worktree: Pick<SpoolWorktreeCatalogEntry, 'worktreeRef' | 'shareEpoch'>
): SpoolWorktreeCatalogEntry | null {
  if (!catalog) {
    return null
  }
  for (const project of catalog.projects) {
    const match = project.worktrees.find(
      (candidate) =>
        candidate.worktreeRef === worktree.worktreeRef &&
        candidate.shareEpoch === worktree.shareEpoch
    )
    if (match) {
      return match
    }
  }
  return null
}

function replaceWorktree(
  catalog: SpoolDesktopCatalog,
  worktreeRef: string,
  replacement: SpoolWorktreeCatalogEntry
): SpoolDesktopCatalog {
  return {
    ...catalog,
    projects: catalog.projects.map((project) => ({
      ...project,
      worktrees: project.worktrees.map((worktree) =>
        worktree.worktreeRef === worktreeRef ? replacement : worktree
      )
    }))
  }
}
