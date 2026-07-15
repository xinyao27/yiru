import { randomUUID } from 'node:crypto'
import { SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE } from '../../shared/spool/spool-catalog-contract'
import type { SpoolSessionCatalogPage } from '../../shared/spool/spool-catalog-contract'
import { createSessionInventoryAbortController } from '../ai-vault/session-inventory-abort'
import type {
  SpoolCatalogReferenceBinding,
  SpoolCatalogReferenceTable
} from './spool-catalog-reference-table'
import {
  buildCatalogSessionPageBindings,
  projectCatalogSessionPage,
  sanitizeCatalogSessionDescriptions,
  type ResolvedSpoolCatalogWorktree
} from './spool-catalog-projection-model'
import type { SpoolShareCatalogSource } from './spool-share-catalog-source'
import type {
  SpoolPublicWorktreeInstance,
  SpoolWorktreeVisibility
} from './spool-worktree-visibility'

export type SpoolCatalogSessionPageRequest = {
  worktreeRef: string
  shareEpoch: string
  catalogRevision: number
  cursor: string
}

type SessionPageReadContext = {
  generation: number
  catalogRevision: number
  snapshotGeneration: number
  snapshotDescriptions: readonly ResolvedSpoolCatalogWorktree[]
  isCurrent(): boolean
  reconcileReferences(): void
}

type CachedSessionPage = {
  binding: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>
  page: SpoolSessionCatalogPage
}

type ActiveSourceChain = {
  instance: SpoolPublicWorktreeInstance
  cursor: string
  inventoryScope: string
}

/** Owns lazy page results and owner cursors for one physical requester connection. */
export class SpoolCatalogSessionPages {
  private readonly dynamicBindings = new Map<string, SpoolCatalogReferenceBinding>()
  private readonly cachedPages = new Map<string, CachedSessionPage>()
  private readonly activeChains = new Map<string, ActiveSourceChain>()
  private readonly pendingReads = new Map<AbortController, string>()
  private inventoryScope = randomUUID()

  constructor(
    private readonly source: SpoolShareCatalogSource,
    private readonly visibility: SpoolWorktreeVisibility,
    private readonly references: SpoolCatalogReferenceTable
  ) {}

  bindings(): SpoolCatalogReferenceBinding[] {
    return [...this.dynamicBindings.values()]
  }

  async read(
    request: SpoolCatalogSessionPageRequest,
    context: SessionPageReadContext,
    signal: AbortSignal
  ): Promise<{ page: SpoolSessionCatalogPage; generation: number } | null> {
    const pageBinding = this.references.resolve(request.cursor)
    const worktreeBinding = this.references.resolve(request.worktreeRef)
    if (!isValidPageRequest(request, context, pageBinding, worktreeBinding, this.visibility)) {
      return null
    }
    const binding = pageBinding as Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>
    const description = findDescription(context.snapshotDescriptions, binding)
    if (!description) {
      return null
    }

    const pending = createSessionInventoryAbortController([signal])
    this.pendingReads.set(pending.controller, binding.instanceId)
    let instance: SpoolPublicWorktreeInstance | null = null
    const inventoryScope = this.inventoryScope
    let releaseCursor: string | null = null
    try {
      pending.controller.signal.throwIfAborted()
      instance = await this.visibility.resolvePublicInstance(binding.instanceId, binding.shareEpoch)
      pending.controller.signal.throwIfAborted()
      if (!instance || instance.worktreeId !== binding.worktreeId || !context.isCurrent()) {
        return null
      }
      const cached = this.cachedPages.get(request.cursor)
      if (cached) {
        return samePageBinding(cached.binding, binding)
          ? { page: cached.page, generation: context.generation }
          : null
      }
      const result = await this.source.listSessionPage(
        instance,
        binding.sourceCursor,
        inventoryScope,
        pending.controller.signal
      )
      releaseCursor = result.nextCursor
      pending.controller.signal.throwIfAborted()
      const sessions = sanitizeCatalogSessionDescriptions(result.sessions)
      if (sessions.length > SPOOL_CATALOG_MAX_SESSIONS_PER_WORKTREE) {
        throw new Error('Spool catalog session page size exceeded')
      }
      const current = await this.visibility.resolvePublicInstance(
        binding.instanceId,
        binding.shareEpoch
      )
      if (
        !current ||
        current.worktreeId !== binding.worktreeId ||
        !sameInstance(current, instance) ||
        !context.isCurrent()
      ) {
        this.releaseSourceCursor(instance, result.nextCursor, inventoryScope)
        return null
      }

      for (const nextBinding of buildCatalogSessionPageBindings(
        description,
        binding,
        sessions,
        result.nextCursor
      )) {
        this.dynamicBindings.set(nextBinding.aliasKey, nextBinding)
      }
      context.reconcileReferences()
      const page = projectCatalogSessionPage(
        request.worktreeRef,
        binding,
        description,
        sessions,
        result.nextCursor,
        this.references
      )
      this.cachedPages.set(request.cursor, { binding, page })
      if (result.nextCursor === null) {
        this.activeChains.delete(binding.instanceId)
      } else {
        this.activeChains.set(binding.instanceId, {
          instance,
          cursor: result.nextCursor,
          inventoryScope
        })
      }
      releaseCursor = null
      return { page, generation: context.generation }
    } catch (error) {
      if (instance && releaseCursor) {
        this.releaseSourceCursor(instance, releaseCursor, inventoryScope)
      }
      this.resetWorktreeForRetry(binding.instanceId)
      context.reconcileReferences()
      throw error
    } finally {
      this.pendingReads.delete(pending.controller)
      pending.dispose()
    }
  }

  invalidateInstance(instanceId: string): void {
    this.abortPendingReads((pendingInstanceId) => pendingInstanceId === instanceId)
    this.releaseActiveChain(instanceId)
    this.deleteBindings(
      (binding) => binding.kind !== 'project' && binding.instanceId === instanceId
    )
    this.deleteCachedPages((page) => page.binding.instanceId === instanceId)
  }

  clear(): void {
    this.abortPendingReads(() => true)
    for (const instanceId of this.activeChains.keys()) {
      this.releaseActiveChain(instanceId)
    }
    this.dynamicBindings.clear()
    this.cachedPages.clear()
    this.inventoryScope = randomUUID()
  }

  private resetWorktreeForRetry(instanceId: string): void {
    this.releaseActiveChain(instanceId)
    // Why: the first wire cursor must restart a failed chain; successful session refs remain usable.
    this.deleteBindings(
      (binding) => binding.kind === 'session-page' && binding.instanceId === instanceId
    )
    this.deleteCachedPages((page) => page.binding.instanceId === instanceId)
  }

  private releaseActiveChain(instanceId: string): void {
    const active = this.activeChains.get(instanceId)
    this.activeChains.delete(instanceId)
    if (active) {
      this.releaseSourceCursor(active.instance, active.cursor, active.inventoryScope)
    }
  }

  private releaseSourceCursor(
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string
  ): void {
    if (cursor === null) {
      return
    }
    try {
      this.source.releaseSessionPage(instance, cursor, inventoryScope)
    } catch {
      // Expiry remains a bounded fallback when a route disappears during cleanup.
    }
  }

  private deleteBindings(predicate: (binding: SpoolCatalogReferenceBinding) => boolean): void {
    for (const [alias, binding] of this.dynamicBindings) {
      if (predicate(binding)) {
        this.dynamicBindings.delete(alias)
      }
    }
  }

  private deleteCachedPages(predicate: (page: CachedSessionPage) => boolean): void {
    for (const [cursor, page] of this.cachedPages) {
      if (predicate(page)) {
        this.cachedPages.delete(cursor)
      }
    }
  }

  private abortPendingReads(predicate: (instanceId: string) => boolean): void {
    for (const [controller, instanceId] of this.pendingReads) {
      if (predicate(instanceId)) {
        controller.abort()
      }
    }
  }
}

function isValidPageRequest(
  request: SpoolCatalogSessionPageRequest,
  context: SessionPageReadContext,
  page: SpoolCatalogReferenceBinding | null,
  worktree: SpoolCatalogReferenceBinding | null,
  visibility: SpoolWorktreeVisibility
): boolean {
  return (
    context.snapshotGeneration === context.generation &&
    request.catalogRevision === context.catalogRevision &&
    page?.kind === 'session-page' &&
    page.catalogRevision === request.catalogRevision &&
    page.generation === context.generation &&
    page.shareEpoch === request.shareEpoch &&
    worktree?.kind === 'worktree' &&
    sameWorktreeBinding(page, worktree) &&
    visibility.isPublic(page.instanceId, page.shareEpoch)
  )
}

function findDescription(
  descriptions: readonly ResolvedSpoolCatalogWorktree[],
  binding: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>
): ResolvedSpoolCatalogWorktree | null {
  return (
    descriptions.find(
      (entry) =>
        entry.instance.instanceId === binding.instanceId &&
        entry.instance.shareEpoch === binding.shareEpoch &&
        entry.instance.worktreeId === binding.worktreeId
    ) ?? null
  )
}

function sameWorktreeBinding(
  page: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>,
  worktree: Extract<SpoolCatalogReferenceBinding, { kind: 'worktree' }>
): boolean {
  return (
    page.worktreeId === worktree.worktreeId &&
    page.instanceId === worktree.instanceId &&
    page.shareEpoch === worktree.shareEpoch
  )
}

function samePageBinding(
  left: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>,
  right: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>
): boolean {
  return left.aliasKey === right.aliasKey && left.sourceCursor === right.sourceCursor
}

function sameInstance(
  left: SpoolPublicWorktreeInstance,
  right: SpoolPublicWorktreeInstance
): boolean {
  return (
    left.worktreeId === right.worktreeId &&
    left.instanceId === right.instanceId &&
    left.shareEpoch === right.shareEpoch &&
    left.spoolIncarnationId === right.spoolIncarnationId &&
    left.actualHostScope === right.actualHostScope
  )
}
