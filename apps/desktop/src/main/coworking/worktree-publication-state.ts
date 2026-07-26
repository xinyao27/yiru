import type { WorktreeMeta } from '../../shared/types'
import type {
  CoworkingOwnerWorktree,
  CoworkingWorktreeRootComparison
} from './worktree-incarnation'
import type { CoworkingPublicationValidation } from './worktree-publication-validation'

export type CoworkingVisibility = 'public' | 'private'

export type CoworkingPublicationSuspensionReason =
  | 'host-unavailable'
  | 'incarnation-unavailable'
  | 'overlapping-root'

export type CoworkingVisibilityInvalidationReason =
  | 'deleted'
  | 'incarnation-changed'
  | 'persistence-failed'
  | 'private'
  | 'startup-deny'
  | CoworkingPublicationSuspensionReason

export type CoworkingPublicWorktreeInstance = {
  worktreeId: string
  instanceId: string
  projectId: string | null
  shareEpoch: string
  coworkingIncarnationId: string
  actualHostScope: string
  ownerWorktree: CoworkingOwnerWorktree
}

export type CoworkingWorktreeVisibilityState = {
  worktreeId: string
  instanceId: string
  projectId: string | null
  visibility: CoworkingVisibility
  publicationStatus: 'pending-validation' | 'private' | 'published' | 'suspended'
  shareEpoch: string | null
  suspensionReason?: CoworkingPublicationSuspensionReason
}

export type CoworkingVisibilitySnapshot = {
  initialized: boolean
  degraded: boolean
  worktrees: readonly CoworkingWorktreeVisibilityState[]
}

export type CoworkingVisibilityChange =
  | {
      kind: 'published'
      worktreeId: string
      instanceId: string
      projectId: string | null
      shareEpoch: string
    }
  | {
      kind: 'invalidated'
      worktreeId: string
      instanceId: string
      previousShareEpoch: string
      reason: CoworkingVisibilityInvalidationReason
      replacementInstanceId?: string
    }

type PublishedWorktree = {
  target: CoworkingOwnerWorktree
  markerId: string
  root: CoworkingWorktreeRootComparison
  shareEpoch: string
}

export class CoworkingWorktreePublicationState {
  private readonly publishedByInstance = new Map<string, PublishedWorktree>()
  private readonly suspendedByInstance = new Map<string, CoworkingPublicationSuspensionReason>()
  private readonly listeners = new Set<(change: CoworkingVisibilityChange) => void>()
  private readonly degradedListeners = new Set<() => void>()

  constructor(
    private readonly createEpoch: () => string,
    private readonly onListenerError: (error: unknown) => void = defaultListenerError
  ) {}

  snapshot(
    metaByWorktreeId: Readonly<Record<string, WorktreeMeta>>,
    initialized: boolean,
    degraded: boolean
  ): CoworkingVisibilitySnapshot {
    const worktrees: CoworkingWorktreeVisibilityState[] = []
    for (const [worktreeId, meta] of Object.entries(metaByWorktreeId)) {
      if (!meta.instanceId) {
        continue
      }
      const visibility = meta.coworkingVisibility === 'public' ? 'public' : 'private'
      const candidatePublication = this.publishedByInstance.get(meta.instanceId)
      const published =
        candidatePublication?.target.worktreeId === worktreeId ? candidatePublication : undefined
      const suspensionReason = this.suspendedByInstance.get(meta.instanceId)
      const publicationStatus =
        visibility === 'private'
          ? 'private'
          : published && suspensionReason !== 'host-unavailable'
            ? 'published'
            : initialized
              ? 'suspended'
              : 'pending-validation'
      worktrees.push({
        worktreeId,
        instanceId: meta.instanceId,
        projectId: meta.projectId ?? null,
        visibility,
        publicationStatus,
        // Why: a brief host outage keeps this runtime/share identity so an
        // already validated catalog row can remain visible without accepting operations.
        shareEpoch: visibility === 'public' ? (published?.shareEpoch ?? null) : null,
        ...(publicationStatus === 'suspended' && suspensionReason ? { suspensionReason } : {})
      })
    }
    worktrees.sort((left, right) => left.worktreeId.localeCompare(right.worktreeId))
    return { initialized, degraded, worktrees }
  }

  get(instanceId: string, shareEpoch?: string): CoworkingPublicWorktreeInstance | null {
    const published = this.publishedByInstance.get(instanceId)
    if (!published || (shareEpoch !== undefined && published.shareEpoch !== shareEpoch)) {
      return null
    }
    return clonePublicInstance(published)
  }

  matches(
    instanceId: string,
    shareEpoch: string,
    candidate: {
      target: CoworkingOwnerWorktree
      markerId: string
      root: CoworkingWorktreeRootComparison
    }
  ): boolean {
    const published = this.publishedByInstance.get(instanceId)
    return Boolean(
      published &&
      published.shareEpoch === shareEpoch &&
      !publicationChanged(published, {
        target: candidate.target,
        markerId: candidate.markerId,
        root: candidate.root,
        shareEpoch
      })
    )
  }

  publish(args: {
    target: CoworkingOwnerWorktree
    markerId: string
    root: CoworkingWorktreeRootComparison
  }): CoworkingPublicWorktreeInstance {
    const existing = this.publishedByInstance.get(args.target.instanceId)
    const published: PublishedWorktree = {
      target: cloneTarget(args.target),
      root: cloneRoot(args.root),
      markerId: args.markerId,
      // Why: an idempotent revalidation preserves active bindings, while any
      // invalidation deletes this record so a later publication gets a fresh epoch.
      shareEpoch: existing?.shareEpoch ?? this.createEpoch()
    }
    this.publishedByInstance.set(published.target.instanceId, published)
    this.suspendedByInstance.delete(published.target.instanceId)
    if (!existing || publicationChanged(existing, published)) {
      this.emit({
        kind: 'published',
        worktreeId: published.target.worktreeId,
        instanceId: published.target.instanceId,
        projectId: published.target.projectId,
        shareEpoch: published.shareEpoch
      })
    }
    return clonePublicInstance(published)
  }

  suspend(instanceIds: readonly string[], reason: CoworkingPublicationSuspensionReason): void {
    for (const instanceId of instanceIds) {
      this.suspendedByInstance.set(instanceId, reason)
      if (reason !== 'host-unavailable') {
        this.invalidatePublished(instanceId, reason)
      }
    }
  }

  invalidate(
    instanceIds: readonly string[],
    reason: CoworkingVisibilityInvalidationReason,
    replacements: ReadonlyMap<string, string> = new Map()
  ): void {
    for (const instanceId of instanceIds) {
      this.suspendedByInstance.delete(instanceId)
      this.invalidatePublished(instanceId, reason, replacements.get(instanceId))
    }
  }

  invalidateAll(reason: CoworkingVisibilityInvalidationReason): void {
    this.invalidate(
      [...new Set([...this.publishedByInstance.keys(), ...this.suspendedByInstance.keys()])],
      reason
    )
  }

  notifyDegraded(): void {
    for (const listener of this.degradedListeners) {
      try {
        listener()
      } catch (error) {
        this.onListenerError(error)
      }
    }
  }

  applyValidationSuspensions(validation: CoworkingPublicationValidation): boolean {
    for (const unavailable of validation.unavailable) {
      this.suspend(
        [unavailable.instanceId],
        unavailable.reason === 'host-unavailable' ? 'host-unavailable' : 'incarnation-unavailable'
      )
    }
    this.suspend(validation.overlappingInstanceIds, 'overlapping-root')
    return validation.unavailable.length === 0 && validation.overlappingInstanceIds.length === 0
  }

  subscribe(listener: (change: CoworkingVisibilityChange) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeDegraded(listener: () => void): () => void {
    this.degradedListeners.add(listener)
    return () => this.degradedListeners.delete(listener)
  }

  private invalidatePublished(
    instanceId: string,
    reason: CoworkingVisibilityInvalidationReason,
    replacementInstanceId?: string
  ): void {
    const published = this.publishedByInstance.get(instanceId)
    if (!published) {
      return
    }
    this.publishedByInstance.delete(instanceId)
    this.emit({
      kind: 'invalidated',
      worktreeId: published.target.worktreeId,
      instanceId,
      previousShareEpoch: published.shareEpoch,
      reason,
      ...(replacementInstanceId ? { replacementInstanceId } : {})
    })
  }

  private emit(change: CoworkingVisibilityChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change)
      } catch (error) {
        // Why: one observer must not interrupt revocation fan-out to later observers.
        this.onListenerError(error)
      }
    }
  }
}

function publicationChanged(left: PublishedWorktree, right: PublishedWorktree): boolean {
  return (
    left.target.kind !== right.target.kind ||
    left.target.worktreeId !== right.target.worktreeId ||
    left.target.instanceId !== right.target.instanceId ||
    left.target.projectId !== right.target.projectId ||
    left.target.repoId !== right.target.repoId ||
    left.target.executionHostId !== right.target.executionHostId ||
    left.target.connectionId !== right.target.connectionId ||
    left.target.projectHostSetupId !== right.target.projectHostSetupId ||
    left.target.worktreePath !== right.target.worktreePath ||
    left.markerId !== right.markerId ||
    left.root.scopeKey !== right.root.scopeKey ||
    left.root.rootKey !== right.root.rootKey ||
    left.root.ancestorKeys.length !== right.root.ancestorKeys.length ||
    left.root.ancestorKeys.some((key, index) => key !== right.root.ancestorKeys[index])
  )
}

function clonePublicInstance(value: PublishedWorktree): CoworkingPublicWorktreeInstance {
  return {
    worktreeId: value.target.worktreeId,
    instanceId: value.target.instanceId,
    projectId: value.target.projectId,
    shareEpoch: value.shareEpoch,
    coworkingIncarnationId: value.markerId,
    actualHostScope: value.root.scopeKey,
    ownerWorktree: cloneTarget(value.target)
  }
}

function cloneTarget(target: CoworkingOwnerWorktree): CoworkingOwnerWorktree {
  return { ...target }
}

function cloneRoot(root: CoworkingWorktreeRootComparison): CoworkingWorktreeRootComparison {
  return { ...root, ancestorKeys: [...root.ancestorKeys] }
}

function defaultListenerError(): void {
  console.error('[coworking] Visibility invalidation listener failed')
}
