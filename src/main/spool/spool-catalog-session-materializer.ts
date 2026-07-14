import type {
  SpoolDesktopCatalog,
  SpoolSessionCatalogEntry,
  SpoolWorktreeCatalogEntry
} from '../../shared/spool/spool-catalog-contract'
import { isSpoolSessionCatalogPage } from './spool-catalog-wire-validation'
import type { SpoolPeerConnection } from './spool-peer-connection'

type MaterializeSpoolCatalogSessionsOptions = {
  baseCatalog: SpoolDesktopCatalog
  previousCatalog: SpoolDesktopCatalog | null
  connection: SpoolPeerConnection
  isCurrent(): boolean
  publish(catalog: SpoolDesktopCatalog): void
}

export async function materializeSpoolCatalogSessions(
  options: MaterializeSpoolCatalogSessionsOptions
): Promise<'complete' | 'error' | 'cancelled'> {
  let catalog = seedLoadingSessions(options.baseCatalog, options.previousCatalog)
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
      const retained = findWorktree(options.previousCatalog, worktree)?.sessions ?? []
      catalog = await materializeWorktree(options, catalog, worktree, retained)
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
  retained: readonly SpoolSessionCatalogEntry[]
): Promise<SpoolDesktopCatalog> {
  let catalog = initialCatalog
  let cursor = worktree.sessionCatalog.nextCursor
  const loaded: SpoolSessionCatalogEntry[] = []
  const loadedRefs = new Set<string>()
  const cursors = new Set<string>()
  try {
    while (cursor) {
      if (cursors.has(cursor)) {
        throw new Error('spool_catalog_session_cursor_repeated')
      }
      cursors.add(cursor)
      const value = await options.connection.request<unknown>('catalog.sessions.page', {
        worktreeRef: worktree.worktreeRef,
        shareEpoch: worktree.shareEpoch,
        catalogRevision: options.baseCatalog.catalogRevision,
        cursor
      })
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
      for (const session of value.sessions) {
        if (loadedRefs.has(session.sessionRef)) {
          throw new Error('duplicate_spool_catalog_session_ref')
        }
        loadedRefs.add(session.sessionRef)
        loaded.push(session)
      }
      const sessions =
        value.sessionCatalog.status === 'complete'
          ? loaded
          : [...loaded, ...retained.filter((session) => !loadedRefs.has(session.sessionRef))]
      catalog = replaceWorktree(catalog, worktree.worktreeRef, {
        ...worktree,
        sessions,
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
    catalog = replaceWorktree(catalog, worktree.worktreeRef, {
      ...worktree,
      sessions: [...loaded, ...retained.filter((session) => !loadedRefs.has(session.sessionRef))],
      sessionCatalog: { status: 'error', nextCursor: null }
    })
    options.publish(catalog)
    return catalog
  }
}

function seedLoadingSessions(
  catalog: SpoolDesktopCatalog,
  previous: SpoolDesktopCatalog | null
): SpoolDesktopCatalog {
  return {
    ...catalog,
    projects: catalog.projects.map((project) => ({
      ...project,
      worktrees: project.worktrees.map((worktree) => {
        if (worktree.sessionCatalog.status !== 'loading') {
          return worktree
        }
        const previousWorktree = findWorktree(previous, worktree)
        if (
          previous?.catalogRevision === catalog.catalogRevision &&
          previousWorktree?.sessionCatalog.status === 'complete'
        ) {
          // Why: catalogRevision excludes quota-only changes, so a completed
          // worktree can keep its full materialized set without another crawl.
          return previousWorktree
        }
        const retained = previousWorktree?.sessions ?? []
        return { ...worktree, sessions: retained }
      })
    }))
  }
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
