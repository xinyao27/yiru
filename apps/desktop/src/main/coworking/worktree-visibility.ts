import { randomUUID } from 'node:crypto'

import { CoworkingPublicVisibilityTransition } from './public-visibility-transition'
import { CoworkingVisibilityError, rethrowPublicationResourceLimit } from './visibility-errors'
import {
  createEmptyCoworkingPublicationPersistence,
  CoworkingVisibilityPersistenceTransitions,
  type CoworkingVisibilityStore
} from './visibility-persistence-transitions'
import { CoworkingVisibilityPublicationRevalidation } from './visibility-publication-revalidation'
import { CoworkingVisibilityTargetResolution } from './visibility-target-resolution'
import { CoworkingVisibilityTransitionSerializer } from './visibility-transition-serializer'
import {
  CoworkingWorktreePublicationState,
  type CoworkingPublicWorktreeInstance,
  type CoworkingVisibilityChange,
  type CoworkingVisibilitySnapshot
} from './worktree-publication-state'
import {
  CoworkingWorktreePublicationValidator,
  type CoworkingOwnerWorktreeCatalog
} from './worktree-publication-validation'
import type {
  CoworkingVisibilityReconciliationSignal,
  CoworkingWorktreeVisibilityOptions
} from './worktree-visibility-contract'

export type {
  CoworkingPublicationSuspensionReason,
  CoworkingPublicWorktreeInstance,
  CoworkingVisibilityChange,
  CoworkingVisibilitySnapshot,
  CoworkingVisibilityInvalidationReason,
  CoworkingWorktreeVisibilityState
} from './worktree-publication-state'
export type { CoworkingOwnerWorktreeCatalog } from './worktree-publication-validation'
export { CoworkingVisibilityError, type CoworkingVisibilityErrorCode } from './visibility-errors'
export type {
  CoworkingVisibilityReconciliationSignal,
  CoworkingWorktreeVisibilityOptions
} from './worktree-visibility-contract'

export class CoworkingWorktreeVisibility {
  private readonly store: CoworkingVisibilityStore
  private readonly denyJournal: CoworkingWorktreeVisibilityOptions['denyJournal']
  private readonly catalog: CoworkingOwnerWorktreeCatalog
  private readonly validator: CoworkingWorktreePublicationValidator
  private readonly publicationState: CoworkingWorktreePublicationState
  private readonly persistence: CoworkingVisibilityPersistenceTransitions
  private readonly revalidation: CoworkingVisibilityPublicationRevalidation
  private readonly targets: CoworkingVisibilityTargetResolution
  private readonly publicTransition: CoworkingPublicVisibilityTransition
  private readonly transitionSerializer: CoworkingVisibilityTransitionSerializer
  private initialized = false
  private degraded = false

  constructor(options: CoworkingWorktreeVisibilityOptions) {
    this.store = options.store
    this.denyJournal = options.denyJournal
    this.catalog = options.catalog
    this.validator = new CoworkingWorktreePublicationValidator(options.catalog, options.incarnation)
    this.publicationState = new CoworkingWorktreePublicationState(
      options.createShareEpoch ?? randomUUID,
      options.onListenerError
    )
    this.transitionSerializer = new CoworkingVisibilityTransitionSerializer({
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
    this.persistence = new CoworkingVisibilityPersistenceTransitions(
      options.store,
      options.denyJournal,
      this.publicationState,
      options.createWorktreeInstanceId ?? randomUUID
    )
    const prepareFirstPublication =
      options.prepareFirstPublication ?? (async () => createEmptyCoworkingPublicationPersistence())
    this.revalidation = new CoworkingVisibilityPublicationRevalidation({
      store: options.store,
      catalog: options.catalog,
      incarnation: options.incarnation,
      validator: this.validator,
      publicationState: this.publicationState,
      persistence: this.persistence,
      prepareFirstPublication,
      isPublic: (instanceId, shareEpoch) => this.isPublic(instanceId, shareEpoch)
    })
    this.targets = new CoworkingVisibilityTargetResolution(options.store, this.publicationState)
    this.publicTransition = new CoworkingPublicVisibilityTransition({
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

  snapshot(): CoworkingVisibilitySnapshot {
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
        !this.denyJournal.snapshotVisibilityDenies().has(instanceId) &&
        meta?.instanceId === instanceId &&
        meta.coworkingVisibility === 'public'
      )
    } catch {
      this.enterDegradedState()
      return false
    }
  }

  getPublishedInstance(
    instanceId: string,
    shareEpoch: string
  ): CoworkingPublicWorktreeInstance | null {
    return this.isPublic(instanceId, shareEpoch)
      ? this.publicationState.get(instanceId, shareEpoch)
      : null
  }

  subscribe(listener: (change: CoworkingVisibilityChange) => void): () => void {
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
          throw new CoworkingVisibilityError('resource-not-found')
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
        throw new CoworkingVisibilityError('resource-not-found')
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

  reconcile(signal: CoworkingVisibilityReconciliationSignal): Promise<void> {
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
  ): Promise<CoworkingPublicWorktreeInstance | null> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      return await this.revalidation.resolvePublicInstance(instanceId, shareEpoch)
    })
  }

  revalidateMutationTarget(
    instanceId: string,
    shareEpoch: string
  ): Promise<CoworkingPublicWorktreeInstance | null> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      return await this.revalidation.revalidateMutationTarget(instanceId, shareEpoch)
    })
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new CoworkingVisibilityError('not-initialized')
    }
    if (this.degraded) {
      throw new CoworkingVisibilityError('persistence-failed')
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
