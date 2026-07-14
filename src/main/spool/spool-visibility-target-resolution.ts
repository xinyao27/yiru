import { FOLDER_WORKSPACE_INSTANCE_SEPARATOR } from '../../shared/worktree-id'
import type { WorktreeMeta } from '../../shared/types'
import { SpoolVisibilityError } from './spool-visibility-errors'
import type {
  SpoolPersistedWorktreeIdentity,
  SpoolVisibilityStore
} from './spool-visibility-persistence-transitions'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import { haveUniqueSpoolWorktreeIdentities } from './spool-worktree-incarnation'
import type { SpoolWorktreePublicationState } from './spool-worktree-publication-state'

export class SpoolVisibilityTargetResolution {
  constructor(
    private readonly store: SpoolVisibilityStore,
    private readonly publicationState: SpoolWorktreePublicationState
  ) {}

  requireCurrentMeta(target: SpoolOwnerWorktree): WorktreeMeta {
    const meta = this.store.getWorktreeMeta(target.worktreeId)
    if (!meta || meta.instanceId !== target.instanceId) {
      const instanceIds = [target.instanceId, meta?.instanceId].filter(
        (instanceId): instanceId is string => Boolean(instanceId)
      )
      this.publicationState.invalidate(instanceIds, 'incarnation-changed')
      throw new SpoolVisibilityError('stale-worktree')
    }
    return meta
  }

  requireUnique(targets: readonly SpoolOwnerWorktree[]): void {
    if (!haveUniqueSpoolWorktreeIdentities(targets)) {
      throw new SpoolVisibilityError('stale-worktree')
    }
  }

  requireProject(projectId: string, targets: readonly SpoolOwnerWorktree[]): void {
    this.requireUnique(targets)
    if (targets.some((target) => target.projectId !== projectId)) {
      throw new SpoolVisibilityError('stale-worktree')
    }
  }

  persisted(worktreeId: string): SpoolPersistedWorktreeIdentity | null {
    const instanceId = this.store.getWorktreeMeta(worktreeId)?.instanceId
    return instanceId ? { worktreeId, instanceId } : null
  }

  persistedProject(projectId: string): readonly SpoolPersistedWorktreeIdentity[] {
    const targets: SpoolPersistedWorktreeIdentity[] = []
    for (const [worktreeId, meta] of Object.entries(this.store.getAllWorktreeMeta())) {
      if (
        meta.projectId === projectId &&
        meta.instanceId &&
        !worktreeId.includes(FOLDER_WORKSPACE_INSTANCE_SEPARATOR)
      ) {
        targets.push({ worktreeId, instanceId: meta.instanceId })
      }
    }
    return targets
  }

  persistedByInstance(instanceId: string): SpoolPersistedWorktreeIdentity | null {
    for (const [worktreeId, meta] of Object.entries(this.store.getAllWorktreeMeta())) {
      if (meta.instanceId === instanceId) {
        return { worktreeId, instanceId }
      }
    }
    return null
  }
}
