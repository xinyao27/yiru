import type {
  CoworkingProjectCatalogEntry,
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPage,
  CoworkingWorktreeCatalogEntry
} from '../../shared/coworking/catalog-contract'
import { isCoworkingProjectIdentityKey } from '../../shared/coworking/catalog-contract'
import type {
  CoworkingCatalogReferenceBinding,
  CoworkingCatalogReferenceTable
} from './catalog-reference-table'
import type {
  CoworkingCatalogSessionDescription,
  CoworkingCatalogWorktreeDescription
} from './share-catalog-source'
import type { CoworkingPublicWorktreeInstance } from './worktree-visibility'

const MAX_CATALOG_LABEL_LENGTH = 240

export type ResolvedCoworkingCatalogWorktree = {
  instance: Pick<CoworkingPublicWorktreeInstance, 'worktreeId' | 'instanceId' | 'shareEpoch'>
  description: CoworkingCatalogWorktreeDescription
}

export function sanitizeCatalogWorktreeDescription(
  instance: CoworkingPublicWorktreeInstance,
  description: CoworkingCatalogWorktreeDescription
): ResolvedCoworkingCatalogWorktree | null {
  const projectKey = boundedIdentity(description.projectKey)
  const projectIdentityKey = isCoworkingProjectIdentityKey(description.projectIdentityKey)
    ? description.projectIdentityKey
    : null
  const projectName = catalogLabel(description.projectName)
  const worktreeName = catalogLabel(description.worktreeName)
  if (
    !projectKey ||
    (description.projectIdentityKey !== null && projectIdentityKey === null) ||
    !projectName ||
    !worktreeName
  ) {
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
      projectIdentityKey,
      projectName,
      worktreeName,
      branch: description.branch ? catalogLabel(description.branch) : null
    }
  }
}

export function sanitizeCatalogSessionDescriptions(
  sessions: readonly CoworkingCatalogSessionDescription[]
): CoworkingCatalogSessionDescription[] {
  return sessions.map((session) => {
    const sessionKey = boundedIdentity(session.sessionKey)
    // Why: an owner-controlled terminal title may contain only control bytes;
    // its stable session identity remains valid and must not hide the whole worktree.
    const title = catalogLabel(session.title) || fallbackCatalogSessionTitle(session)
    if (!sessionKey) {
      // Why: silently omitting an invalid row could turn a partial owner page into completeness.
      throw new Error('Invalid Coworking catalog session description')
    }
    return session.kind === 'terminal'
      ? { sessionKey, kind: 'terminal', agent: null, title }
      : { sessionKey, kind: 'agent', agent: session.agent, title }
  })
}

function fallbackCatalogSessionTitle(session: CoworkingCatalogSessionDescription): string {
  return session.kind === 'terminal' ? 'terminal' : (session.agent ?? 'agent')
}

export function buildCatalogReferenceBindings(
  descriptions: readonly ResolvedCoworkingCatalogWorktree[],
  catalogRevision: number,
  generation: number
): CoworkingCatalogReferenceBinding[] {
  const bindings: CoworkingCatalogReferenceBinding[] = []
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
  description: ResolvedCoworkingCatalogWorktree,
  binding: Extract<CoworkingCatalogReferenceBinding, { kind: 'session-page' }>,
  sessions: readonly CoworkingCatalogSessionDescription[],
  nextSourceCursor: string | null
): CoworkingCatalogReferenceBinding[] {
  const worktreeAlias = worktreeAliasKey(
    description.instance.instanceId,
    description.instance.shareEpoch
  )
  const bindings: CoworkingCatalogReferenceBinding[] = sessions.map((session) => ({
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

export function buildReservedCatalogSessionBinding(
  instance: Pick<CoworkingPublicWorktreeInstance, 'worktreeId' | 'instanceId' | 'shareEpoch'>,
  sessionKey: string,
  catalogRevision: number,
  generation: number
): Extract<CoworkingCatalogReferenceBinding, { kind: 'session' }> {
  const worktreeAlias = worktreeAliasKey(instance.instanceId, instance.shareEpoch)
  return {
    kind: 'session',
    aliasKey: sessionAliasKey(worktreeAlias, sessionKey),
    worktreeId: instance.worktreeId,
    instanceId: instance.instanceId,
    shareEpoch: instance.shareEpoch,
    sessionKey,
    catalogRevision,
    generation
  }
}

export function projectCatalogEntries(
  descriptions: readonly ResolvedCoworkingCatalogWorktree[],
  references: CoworkingCatalogReferenceTable,
  catalogRevision: number,
  generation: number
): readonly CoworkingProjectCatalogEntry[] {
  const projects = new Map<string, CoworkingProjectCatalogEntry>()
  for (const { instance, description } of descriptions) {
    const worktreeAlias = worktreeAliasKey(instance.instanceId, instance.shareEpoch)
    const worktree: CoworkingWorktreeCatalogEntry = {
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
        // Why: v2 readers already treat projectRef as opaque. Reusing it for a
        // portable identity lets new peers match Projects while old peers keep working.
        projectRef:
          description.projectIdentityKey ??
          references.referenceFor(projectAliasKey(description.projectKey)),
        name: description.projectName,
        worktrees: [worktree]
      })
    }
  }
  return [...projects.values()]
}

export function projectCatalogSessionPage(
  worktreeRef: string,
  binding: Extract<CoworkingCatalogReferenceBinding, { kind: 'session-page' }>,
  description: ResolvedCoworkingCatalogWorktree,
  sessions: readonly CoworkingCatalogSessionDescription[],
  nextSourceCursor: string | null,
  references: CoworkingCatalogReferenceTable
): CoworkingSessionCatalogPage {
  const worktreeAlias = worktreeAliasKey(
    description.instance.instanceId,
    description.instance.shareEpoch
  )
  const projected: CoworkingSessionCatalogEntry[] = sessions.map((session) => {
    const sessionRef = references.referenceFor(sessionAliasKey(worktreeAlias, session.sessionKey))
    return session.kind === 'terminal'
      ? { sessionRef, kind: 'terminal', agent: null, title: session.title }
      : { sessionRef, kind: 'agent', agent: session.agent, title: session.title }
  })
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
  instance: Pick<CoworkingPublicWorktreeInstance, 'worktreeId' | 'instanceId' | 'shareEpoch'>,
  worktreeAlias: string,
  catalogRevision: number,
  generation: number,
  pageIndex: number,
  sourceCursor: string | null
): Extract<CoworkingCatalogReferenceBinding, { kind: 'session-page' }> {
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
