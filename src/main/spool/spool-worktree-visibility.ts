import { randomUUID } from 'node:crypto'
import { SPOOL_CATALOG_MAX_WORKTREES } from '../../shared/spool/spool-catalog-contract'
import { SpoolVisibilityError } from './spool-visibility-errors'
import {
  SpoolVisibilityPersistenceTransitions,
  type SpoolVisibilityStore
} from './spool-visibility-persistence-transitions'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
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
  private readonly attestFirstPublication: NonNullable<
    SpoolWorktreeVisibilityOptions['attestFirstPublication']
  >
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
    this.revalidation = new SpoolVisibilityPublicationRevalidation({
      store: options.store,
      catalog: options.catalog,
      incarnation: options.incarnation,
      validator: this.validator,
      publicationState: this.publicationState,
      persistence: this.persistence,
      isPublic: (instanceId, shareEpoch) => this.isPublic(instanceId, shareEpoch)
    })
    this.targets = new SpoolVisibilityTargetResolution(options.store, this.publicationState)
    this.attestFirstPublication = options.attestFirstPublication ?? (async () => {})
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
      const target = await this.catalog.getWorktree(worktreeId)
      if (!target) {
        const instanceId = this.store.getWorktreeMeta(worktreeId)?.instanceId
        if (instanceId) {
          this.publicationState.invalidate([instanceId], 'deleted')
        }
        throw new SpoolVisibilityError('resource-not-found')
      }
      await this.makePublic([target])
    })
  }

  setProject(projectId: string, visibility: 'public' | 'private'): Promise<void> {
    return this.transitionSerializer.serialize(async () => {
      this.requireInitialized()
      if (visibility === 'private') {
        this.persistence.makePrivate(this.targets.persistedProject(projectId))
        return
      }
      const targets = [...(await this.catalog.listProjectWorktrees(projectId))]
      this.targets.requireProject(projectId, targets)
      await this.makePublic(targets)
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

  private async makePublic(targets: readonly SpoolOwnerWorktree[]): Promise<void> {
    this.targets.requireUnique(targets)
    if (targets.length === 0) {
      return
    }
    const currentTargets = targets.map((target) => ({
      target,
      meta: this.targets.requireCurrentMeta(target)
    }))
    const metaByWorktreeId = this.store.getAllWorktreeMeta()
    const currentPublicCount = Object.values(metaByWorktreeId).filter(
      (meta) => meta.spoolVisibility === 'public'
    ).length
    const newPublicCount = currentTargets.filter(
      ({ meta }) => meta.spoolVisibility !== 'public'
    ).length
    if (currentPublicCount + newPublicCount > SPOOL_CATALOG_MAX_WORKTREES) {
      // Why: the V1 wire cap is an owner-side publication limit, never a truncation rule.
      throw new SpoolVisibilityError('resource-limit')
    }
    const candidates = currentTargets.map(({ target, meta }) => {
      return {
        target,
        expectedMarkerId: meta.spoolIncarnationId,
        requirePersistedMarker: meta.spoolVisibility === 'public'
      }
    })
    const validation = await this.validator.validate(candidates)
    const validationUsable = this.publicationState.applyValidationSuspensions(validation)
    if (validation.replaced.length > 0) {
      this.persistence.rotateReplaced(validation.replaced)
      throw new SpoolVisibilityError('incarnation-changed')
    }
    if (!validationUsable || validation.ready.length !== targets.length) {
      throw new SpoolVisibilityError(
        validation.overlappingInstanceIds.length > 0 ? 'overlapping-root' : 'not-shareable'
      )
    }
    // Why: legacy transcript proofs must be durable before the share epoch can expose them.
    await this.attestFirstPublication(validation.ready)
    this.persistence.commitPublic(validation.ready)
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
