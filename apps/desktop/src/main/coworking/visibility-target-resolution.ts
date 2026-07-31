import type { WorktreeMeta } from '~shared/types'

import { CoworkingVisibilityError } from './visibility-errors'
import type {
  CoworkingPersistedWorktreeIdentity,
  CoworkingVisibilityStore
} from './visibility-persistence-transitions'
import type { CoworkingOwnerWorktree } from './worktree-incarnation'
import { haveUniqueCoworkingWorktreeIdentities } from './worktree-incarnation'
import type { CoworkingWorktreePublicationState } from './worktree-publication-state'

export class CoworkingVisibilityTargetResolution {
  constructor(
    private readonly store: CoworkingVisibilityStore,
    private readonly publicationState: CoworkingWorktreePublicationState
  ) {}

  requireCurrentMeta(target: CoworkingOwnerWorktree): WorktreeMeta {
    const meta = this.store.getWorktreeMeta(target.worktreeId)
    if (!meta || meta.instanceId !== target.instanceId) {
      const instanceIds = [target.instanceId, meta?.instanceId].filter(
        (instanceId): instanceId is string => Boolean(instanceId)
      )
      this.publicationState.invalidate(instanceIds, 'incarnation-changed')
      throw new CoworkingVisibilityError('stale-worktree')
    }
    return meta
  }

  requireUnique(targets: readonly CoworkingOwnerWorktree[]): void {
    if (!haveUniqueCoworkingWorktreeIdentities(targets)) {
      throw new CoworkingVisibilityError('stale-worktree')
    }
  }

  requireProject(projectId: string, targets: readonly CoworkingOwnerWorktree[]): void {
    this.requireUnique(targets)
    if (targets.some((target) => target.projectId !== projectId)) {
      throw new CoworkingVisibilityError('stale-worktree')
    }
  }

  persisted(worktreeId: string): CoworkingPersistedWorktreeIdentity | null {
    const instanceId = this.store.getWorktreeMeta(worktreeId)?.instanceId
    return instanceId ? { worktreeId, instanceId } : null
  }

  persistedProject(projectId: string): readonly CoworkingPersistedWorktreeIdentity[] {
    const targets: CoworkingPersistedWorktreeIdentity[] = []
    for (const [worktreeId, meta] of Object.entries(this.store.getAllWorktreeMeta())) {
      if (meta.projectId === projectId && meta.instanceId) {
        targets.push({ worktreeId, instanceId: meta.instanceId })
      }
    }
    return targets
  }

  persistedByInstance(instanceId: string): CoworkingPersistedWorktreeIdentity | null {
    for (const [worktreeId, meta] of Object.entries(this.store.getAllWorktreeMeta())) {
      if (meta.instanceId === instanceId) {
        return { worktreeId, instanceId }
      }
    }
    return null
  }
}
