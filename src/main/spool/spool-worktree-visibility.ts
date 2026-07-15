import { randomUUID } from 'node:crypto'
import { SpoolVisibilityError, rethrowPublicationResourceLimit } from './spool-visibility-errors'
import {
  createEmptySpoolPublicationPersistence,
  SpoolVisibilityPersistenceTransitions,
  type SpoolVisibilityStore
} from './spool-visibility-persistence-transitions'
import { SpoolPublicVisibilityTransition } from './spool-public-visibility-transition'
import {
  SpoolWorktreePublicationState,
  type SpoolPublicWorktreeInstance,
  type SpoolVisibilityChange,
  type SpoolVisibilitySnapshot
} from './spool-worktree-publication-state'
import {
  SpoolWorktreePublicationValidator,
  type SpoolOwnerWorktreeCatalog
} from './spool-worktree-publication-validation'
import { SpoolVisibilityPublicationRevalidation } from './spool-visibility-publication-revalidation'
import { SpoolVisibilityTargetResolution } from './spool-visibility-target-resolution'
import { SpoolVisibilityTransitionSerializer } from './spool-visibility-transition-serializer'
import type {
  SpoolVisibilityReconciliationSignal,
  SpoolWorktreeVisibilityOptions
} from './spool-worktree-visibility-contract'

export type {
  SpoolPublicationSuspensionReason,
  SpoolPublicWorktreeInstance,
  SpoolVisibilityChange,
  SpoolVisibilitySnapshot,
  SpoolVisibilityInvalidationReason,
  SpoolWorktreeVisibilityState
} from './spool-worktree-publication-state'
export type { SpoolOwnerWorktreeCatalog } from './spool-worktree-publication-validation'
export { SpoolVisibilityError, type SpoolVisibilityErrorCode } from './spool-visibility-errors'
export type {
  SpoolVisibilityReconciliationSignal,
  SpoolWorktreeVisibilityOptions
} from './spool-worktree-visibility-contract'

export class SpoolWorktreeVisibility {
  private readonly store: SpoolVisibilityStore
  private readonly denyJournal: SpoolWorktreeVisibilityOptions['denyJournal']
  private readonly catalog: SpoolOwnerWorktreeCatalog
  private readonly validator: SpoolWorktreePublicationValidator
  private readonly publicationState: SpoolWorktreePublicationState
  private readonly persistence: SpoolVisibilityPersistenceTransitions
  private readonly revalidation: SpoolVisibilityPublicationRevalidation
  private readonly targets: SpoolVisibilityTargetResolution
  private readonly publicTransition: SpoolPublicVisibilityTransition
  private readonly transitionSerializer: SpoolVisibilityTransitionSerializer
  private initialized = false
  private degraded = false

  constructor(options: SpoolWorktreeVisibilityOptions) {
    this.store = options.store
    this.denyJournal = options.denyJournal
    this.catalog = options.catalog
    this.validator = new SpoolWorktreePublicationValidator(options.catalog, options.incarnation)
    this.publicationState = new SpoolWorktreePublicationState(
      options.createShareEpoch ?? randomUUID,
      options.onListenerError
    )
    this.transitionSerializer = new SpoolVisibilityTransitionSerializer({
      isDegraded: () => this.degraded,
      enterDegraded: () => this.enterDegradedState(),
      beginInitializationRecovery: () => {
        this.initialized = false
      },
      completeInitializationRecovery: () => {
        this.degraded = false
      },
      failInitializationRecovery: () => {
        this.publicationState.invalidateAll('persistence-failed')
        this.degraded = true
      }
    })
    this.persistence = new SpoolVisibilityPersistenceTransitions(
      options.store,
      options.denyJournal,
      this.publicationState,
      options.createWorktreeInstanceId ?? randomUUID
    )
    const prepareFirstPublication =
      options.prepareFirstPublication ?? (async () => createEmptySpoolPublicationPersistence())
    this.revalidation = new SpoolVisibilityPublicationRevalidation({
      store: options.store,
      catalog: options.catalog,
      incarnation: options.incarnation,
      validator: this.validator,
      publicationState: this.publicationState,
      persistence: this.persistence,
      prepareFirstPublication,
      isPublic: (instanceId, shareEpoch) => this.isPublic(instanceId, shareEpoch)
    })
    this.targets = new SpoolVisibilityTargetResolution(options.store, this.publicationState)
    this.publicTransition = new SpoolPublicVisibilityTransition({
      store: options.store,
      targets: this.targets,
      validator: this.validator,
      publicationState: this.publicationState,
      persistence: this.persistence,
      prepareFirstPublication
    })
  }

  initialize(): Promise<void> {
    const operation = async (): Promise<void> => {
      if (this.initialized) {
        return
      }
      // Why: recovery must make every crash-left deny durable before any
      // persisted Public row can receive a new in-memory share epoch.
      this.persistence.recoverDenyJournal()
      await this.revalidation.revalidatePersistedPublic()
      this.initialized = true
    }
    return this.degraded
      ? this.transitionSerializer.serializeInitializationRecovery(operation)
      : this.transitionSerializer.serialize(operation)
  }

  snapshot(): SpoolVisibilitySnapshot {
    return this.publicationState.snapshot(
      { ...this.store.getAllWorktreeMeta() },
      this.initialized,
      this.degraded
    )
  }

  isPublic(instanceId: string, shareEpoch: string): boolean {
    if (!this.initialized || this.degraded) {
      return false
    }
    const published = this.publicationState.get(instanceId, shareEpoch)
    const meta = published ? this.store.getWorktreeMeta(published.worktreeId) : undefined
    try {
      return (
        !this.denyJournal.snapshot().has(instanceId) &&
        meta?.instanceId === instanceId &&
        meta.spoolVisibility === 'public'
      )
    } catch {
      this.enterDegradedState()
      return false
    }
  }

  subscribe(listener: (change: SpoolVisibilityChange) => void): () => void {
    return this.publicationState.subscribe(listener)
  }

  subscribeDegraded(listener: () => void): () => void {
    return this.publicationState.subscribeDegraded(listener)
  }

  setWorktree(worktreeId: string, visibility: 'public' | 'private'): Promise<void> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      if (visibility === 'private') {
        const target = this.targets.persisted(worktreeId)
        if (!target) {
          throw new SpoolVisibilityError('resource-not-found')
        }
        this.persistence.makePrivate([target])
        return
      }
      let target
      try {
        target = await this.catalog.getWorktree(worktreeId)
      } catch (error) {
        rethrowPublicationResourceLimit(error)
      }
      if (!target) {
        const instanceId = this.store.getWorktreeMeta(worktreeId)?.instanceId
        if (instanceId) {
          this.publicationState.invalidate([instanceId], 'deleted')
        }
        throw new SpoolVisibilityError('resource-not-found')
      }
      await this.publicTransition.commit([target])
    })
  }

  setProject(projectId: string, visibility: 'public' | 'private'): Promise<void> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      if (visibility === 'private') {
        this.persistence.makePrivate(this.targets.persistedProject(projectId))
        return
      }
      let targets
      try {
        targets = [...(await this.catalog.listProjectWorktrees(projectId))]
      } catch (error) {
        rethrowPublicationResourceLimit(error)
      }
      this.targets.requireProject(projectId, targets)
      await this.publicTransition.commit(targets)
    })
  }

  reconcile(signal: SpoolVisibilityReconciliationSignal): Promise<void> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      if (signal.kind === 'deleted') {
        const persisted = this.targets.persistedByInstance(signal.instanceId)
        if (persisted) {
          this.persistence.makePrivate([persisted])
        } else {
          this.publicationState.invalidate([signal.instanceId], 'deleted')
        }
        return
      }
      if (signal.kind === 'host-unavailable') {
        this.publicationState.suspend([signal.instanceId], 'host-unavailable')
        return
      }
      await this.revalidation.revalidatePersistedPublic()
    })
  }

  resolvePublicInstance(
    instanceId: string,
    shareEpoch: string
  ): Promise<SpoolPublicWorktreeInstance | null> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      return await this.revalidation.resolvePublicInstance(instanceId, shareEpoch)
    })
  }

  revalidateMutationTarget(
    instanceId: string,
    shareEpoch: string
  ): Promise<SpoolPublicWorktreeInstance | null> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      return await this.revalidation.revalidateMutationTarget(instanceId, shareEpoch)
    })
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new SpoolVisibilityError('not-initialized')
    }
    if (this.degraded) {
      throw new SpoolVisibilityError('persistence-failed')
    }
  }

  private enterDegradedState(): void {
    if (this.degraded) {
      return
    }
    this.degraded = true
    this.publicationState.invalidateAll('persistence-failed')
    // Why: ingress must close even when no worktree was published, so degraded
    // is an explicit lifecycle event rather than only a per-worktree invalidation.
    this.publicationState.notifyDegraded()
  }
}
