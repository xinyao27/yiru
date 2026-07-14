import type {
  SpoolProjectCatalogEntry,
  SpoolSessionCatalogEntry,
  SpoolSessionCatalogPage,
  SpoolWorktreeCatalogEntry
} from '../../shared/spool/spool-catalog-contract'
import { SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE } from '../../shared/spool/spool-catalog-contract'
import type { SpoolCatalogReferenceBinding } from './spool-catalog-reference-table'
import type { SpoolCatalogReferenceTable } from './spool-catalog-reference-table'
import type {
  SpoolCatalogSessionDescription,
  SpoolCatalogWorktreeDescription
} from './spool-share-catalog'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

const MAX_CATALOG_LABEL_LENGTH = 240

export type ResolvedSpoolCatalogWorktree = {
  instance: Pick<SpoolPublicWorktreeInstance, 'worktreeId' | 'instanceId' | 'shareEpoch'>
  description: SpoolCatalogWorktreeDescription
}

export function sanitizeCatalogWorktreeDescription(
  instance: SpoolPublicWorktreeInstance,
  description: SpoolCatalogWorktreeDescription
): ResolvedSpoolCatalogWorktree | null {
  const projectKey = boundedIdentity(description.projectKey)
  const projectName = catalogLabel(description.projectName)
  const worktreeName = catalogLabel(description.worktreeName)
  if (!projectKey || !projectName || !worktreeName) {
    return null
  }
  const sessions = description.sessions
    .map((session) => ({
      sessionKey: boundedIdentity(session.sessionKey),
      provider: session.provider,
      title: catalogLabel(session.title)
    }))
    .filter((session): session is SpoolCatalogSessionDescription =>
      Boolean(session.sessionKey && session.title)
    )
  return {
    // Why: cached catalog rows retain binding identity, never owner paths or host locators.
    instance: {
      worktreeId: instance.worktreeId,
      instanceId: instance.instanceId,
      shareEpoch: instance.shareEpoch
    },
    description: {
      projectKey,
      projectName,
      worktreeName,
      branch: description.branch ? catalogLabel(description.branch) : null,
      sessions
    }
  }
}

export function buildCatalogReferenceBindings(
  descriptions: readonly ResolvedSpoolCatalogWorktree[],
  catalogRevision: number,
  generation: number
): SpoolCatalogReferenceBinding[] {
  const bindings: SpoolCatalogReferenceBinding[] = []
  for (const { instance, description } of descriptions) {
    bindings.push({
      kind: 'project',
      aliasKey: projectAliasKey(description.projectKey),
      projectKey: description.projectKey
    })
    const worktreeAlias = worktreeAliasKey(instance.instanceId, instance.shareEpoch)
    bindings.push({
      kind: 'worktree',
      aliasKey: worktreeAlias,
      worktreeId: instance.worktreeId,
      instanceId: instance.instanceId,
      shareEpoch: instance.shareEpoch
    })
    for (const session of description.sessions) {
      bindings.push({
        kind: 'session',
        aliasKey: sessionAliasKey(worktreeAlias, session.sessionKey),
        worktreeId: instance.worktreeId,
        instanceId: instance.instanceId,
        shareEpoch: instance.shareEpoch,
        sessionKey: session.sessionKey
      })
    }
    for (
      let offset = 0;
      offset < description.sessions.length;
      offset += SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE
    ) {
      bindings.push({
        kind: 'session-page',
        aliasKey: sessionPageAliasKey(worktreeAlias, offset, catalogRevision, generation),
        worktreeId: instance.worktreeId,
        instanceId: instance.instanceId,
        shareEpoch: instance.shareEpoch,
        offset,
        catalogRevision,
        generation
      })
    }
  }
  return bindings
}

export function projectCatalogEntries(
  descriptions: readonly ResolvedSpoolCatalogWorktree[],
  references: SpoolCatalogReferenceTable,
  catalogRevision: number,
  generation: number
): readonly SpoolProjectCatalogEntry[] {
  const projects = new Map<string, SpoolProjectCatalogEntry>()
  for (const { instance, description } of descriptions) {
    const worktreeAlias = worktreeAliasKey(instance.instanceId, instance.shareEpoch)
    const worktree: SpoolWorktreeCatalogEntry = {
      worktreeRef: references.referenceFor(worktreeAlias),
      shareEpoch: instance.shareEpoch,
      name: description.worktreeName,
      branch: description.branch,
      sessions: [],
      sessionCatalog:
        description.sessions.length > 0
          ? {
              status: 'loading',
              nextCursor: references.referenceFor(
                sessionPageAliasKey(worktreeAlias, 0, catalogRevision, generation)
              )
            }
          : { status: 'complete', nextCursor: null }
    }
    const existing = projects.get(description.projectKey)
    if (existing) {
      projects.set(description.projectKey, {
        ...existing,
        worktrees: [...existing.worktrees, worktree]
      })
    } else {
      projects.set(description.projectKey, {
        projectRef: references.referenceFor(projectAliasKey(description.projectKey)),
        name: description.projectName,
        worktrees: [worktree]
      })
    }
  }
  return [...projects.values()]
}

export function projectCatalogSessionPage(
  worktreeRef: string,
  binding: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>,
  description: ResolvedSpoolCatalogWorktree,
  catalogRevision: number,
  references: SpoolCatalogReferenceTable
): SpoolSessionCatalogPage {
  const worktreeAlias = worktreeAliasKey(
    description.instance.instanceId,
    description.instance.shareEpoch
  )
  const pageSessions = description.description.sessions.slice(
    binding.offset,
    binding.offset + SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE
  )
  const sessions: SpoolSessionCatalogEntry[] = pageSessions.map((session) => ({
    sessionRef: references.referenceFor(sessionAliasKey(worktreeAlias, session.sessionKey)),
    provider: session.provider,
    title: session.title
  }))
  const nextOffset = binding.offset + pageSessions.length
  const hasNext = nextOffset < description.description.sessions.length
  return {
    catalogRevision,
    worktreeRef,
    shareEpoch: description.instance.shareEpoch,
    sessions,
    sessionCatalog: hasNext
      ? {
          status: 'loading',
          nextCursor: references.referenceFor(
            sessionPageAliasKey(
              worktreeAlias,
              nextOffset,
              binding.catalogRevision,
              binding.generation
            )
          )
        }
      : { status: 'complete', nextCursor: null }
  }
}

function projectAliasKey(projectKey: string): string {
  return `project\0${projectKey}`
}

function worktreeAliasKey(instanceId: string, shareEpoch: string): string {
  return `worktree\0${instanceId}\0${shareEpoch}`
}

function sessionAliasKey(worktreeAlias: string, sessionKey: string): string {
  return `session\0${worktreeAlias}\0${sessionKey}`
}

function sessionPageAliasKey(
  worktreeAlias: string,
  offset: number,
  catalogRevision: number,
  generation: number
): string {
  return `session-page\0${worktreeAlias}\0${catalogRevision}\0${generation}\0${offset}`
}

function boundedIdentity(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= 2048 ? trimmed : ''
}

function catalogLabel(value: string): string {
  let label = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code > 0x1f && code !== 0x7f) {
      label += character
    }
  }
  return label.trim().slice(0, MAX_CATALOG_LABEL_LENGTH)
}
