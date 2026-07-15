import type {
  SpoolProjectCatalogEntry,
  SpoolSessionCatalogEntry,
  SpoolSessionCatalogPage,
  SpoolWorktreeCatalogEntry
} from '../../shared/spool/spool-catalog-contract'
import type {
  SpoolCatalogReferenceBinding,
  SpoolCatalogReferenceTable
} from './spool-catalog-reference-table'
import type {
  SpoolCatalogSessionDescription,
  SpoolCatalogWorktreeDescription
} from './spool-share-catalog-source'
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
  return {
    // Why: cached catalog rows retain binding identity, never owner paths or host locators.
    instance: {
      worktreeId: instance.worktreeId,
      instanceId: instance.instanceId,
      shareEpoch: instance.shareEpoch
    },
    description: {
      kind: description.kind,
      projectKey,
      projectName,
      worktreeName,
      branch: description.branch ? catalogLabel(description.branch) : null
    }
  }
}

export function sanitizeCatalogSessionDescriptions(
  sessions: readonly SpoolCatalogSessionDescription[]
): SpoolCatalogSessionDescription[] {
  return sessions.map((session) => {
    const sessionKey = boundedIdentity(session.sessionKey)
    const title = catalogLabel(session.title)
    if (!sessionKey || !title) {
      // Why: silently omitting an invalid row could turn a partial owner page into completeness.
      throw new Error('Invalid Spool catalog session description')
    }
    return { sessionKey, provider: session.provider, title }
  })
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
    bindings.push(sessionPageBinding(instance, worktreeAlias, catalogRevision, generation, 0, null))
  }
  return bindings
}

export function buildCatalogSessionPageBindings(
  description: ResolvedSpoolCatalogWorktree,
  binding: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>,
  sessions: readonly SpoolCatalogSessionDescription[],
  nextSourceCursor: string | null
): SpoolCatalogReferenceBinding[] {
  const worktreeAlias = worktreeAliasKey(
    description.instance.instanceId,
    description.instance.shareEpoch
  )
  const bindings: SpoolCatalogReferenceBinding[] = sessions.map((session) => ({
    kind: 'session',
    aliasKey: sessionAliasKey(worktreeAlias, session.sessionKey),
    worktreeId: description.instance.worktreeId,
    instanceId: description.instance.instanceId,
    shareEpoch: description.instance.shareEpoch,
    sessionKey: session.sessionKey,
    catalogRevision: binding.catalogRevision,
    generation: binding.generation
  }))
  if (nextSourceCursor !== null) {
    bindings.push(
      sessionPageBinding(
        description.instance,
        worktreeAlias,
        binding.catalogRevision,
        binding.generation,
        binding.pageIndex + 1,
        nextSourceCursor
      )
    )
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
      kind: description.kind,
      worktreeRef: references.referenceFor(worktreeAlias),
      shareEpoch: instance.shareEpoch,
      name: description.worktreeName,
      branch: description.branch,
      sessions: [],
      sessionCatalog: {
        status: 'loading',
        nextCursor: references.referenceFor(
          sessionPageAliasKey(worktreeAlias, 0, catalogRevision, generation)
        )
      }
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
  sessions: readonly SpoolCatalogSessionDescription[],
  nextSourceCursor: string | null,
  references: SpoolCatalogReferenceTable
): SpoolSessionCatalogPage {
  const worktreeAlias = worktreeAliasKey(
    description.instance.instanceId,
    description.instance.shareEpoch
  )
  const projected: SpoolSessionCatalogEntry[] = sessions.map((session) => ({
    sessionRef: references.referenceFor(sessionAliasKey(worktreeAlias, session.sessionKey)),
    provider: session.provider,
    title: session.title
  }))
  return {
    catalogRevision: binding.catalogRevision,
    worktreeRef,
    shareEpoch: description.instance.shareEpoch,
    sessions: projected,
    sessionCatalog:
      nextSourceCursor === null
        ? { status: 'complete', nextCursor: null }
        : {
            status: 'loading',
            nextCursor: references.referenceFor(
              sessionPageAliasKey(
                worktreeAlias,
                binding.pageIndex + 1,
                binding.catalogRevision,
                binding.generation
              )
            )
          }
  }
}

function sessionPageBinding(
  instance: Pick<SpoolPublicWorktreeInstance, 'worktreeId' | 'instanceId' | 'shareEpoch'>,
  worktreeAlias: string,
  catalogRevision: number,
  generation: number,
  pageIndex: number,
  sourceCursor: string | null
): Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }> {
  return {
    kind: 'session-page',
    aliasKey: sessionPageAliasKey(worktreeAlias, pageIndex, catalogRevision, generation),
    worktreeId: instance.worktreeId,
    instanceId: instance.instanceId,
    shareEpoch: instance.shareEpoch,
    pageIndex,
    sourceCursor,
    catalogRevision,
    generation
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
  pageIndex: number,
  catalogRevision: number,
  generation: number
): string {
  return `session-page\0${worktreeAlias}\0${catalogRevision}\0${generation}\0${pageIndex}`
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
