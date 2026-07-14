import type { Store, SpoolVisibilityCommitChange } from '../persistence'
import type { SpoolVisibilityDenyJournal } from './spool-visibility-deny-journal'
import { SpoolVisibilityError } from './spool-visibility-errors'
import type {
  SpoolVisibilityInvalidationReason,
  SpoolWorktreePublicationState
} from './spool-worktree-publication-state'
import type {
  PreparedSpoolPublication,
  ReplacedSpoolPublication
} from './spool-worktree-publication-validation'

export type SpoolPersistedWorktreeIdentity = {
  worktreeId: string
  instanceId: string
}

export type SpoolVisibilityStore = Pick<
  Store,
  'commitSpoolVisibility' | 'getAllWorktreeMeta' | 'getWorktreeMeta'
>

export class SpoolVisibilityPersistenceTransitions {
  constructor(
    private readonly store: SpoolVisibilityStore,
    private readonly denyJournal: Pick<SpoolVisibilityDenyJournal, 'add' | 'remove' | 'snapshot'>,
    private readonly publicationState: SpoolWorktreePublicationState,
    private readonly createId: () => string
  ) {}

  recoverDenyJournal(): void {
    const denied = [...this.denyJournal.snapshot()]
    if (denied.length === 0) {
      return
    }
    const deniedSet = new Set(denied)
    const changes: SpoolVisibilityCommitChange[] = []
    for (const [worktreeId, meta] of Object.entries(this.store.getAllWorktreeMeta())) {
      if (meta.instanceId && deniedSet.has(meta.instanceId)) {
        changes.push({
          worktreeId,
          expectedInstanceId: meta.instanceId,
          visibility: 'private'
        })
      }
    }
    this.publicationState.invalidate(denied, 'startup-deny')
    this.persist(() => {
      if (changes.length > 0) {
        this.store.commitSpoolVisibility(changes)
      }
      this.denyJournal.remove(denied)
    })
  }

  commitPublic(entries: readonly PreparedSpoolPublication[]): void {
    const instanceIds = entries.map((entry) => entry.target.instanceId)
    try {
      // Why: a publication is not observable until both durable metadata and
      // any older crash-deny agree that this instance is Public.
      this.store.commitSpoolVisibility(
        entries.map((entry) => ({
          worktreeId: entry.target.worktreeId,
          expectedInstanceId: entry.target.instanceId,
          visibility: 'public',
          spoolIncarnationId: entry.markerId
        }))
      )
      this.denyJournal.remove(instanceIds)
    } catch (error) {
      this.publicationState.suspend(instanceIds, 'incarnation-unavailable')
      throw new SpoolVisibilityError('persistence-failed', { cause: error })
    }
    for (const entry of entries) {
      this.publicationState.publish(entry)
    }
  }

  makePrivate(targets: readonly SpoolPersistedWorktreeIdentity[]): void {
    const instanceIds = targets.map((target) => target.instanceId)
    this.commitDenyFirstTransition(instanceIds, 'private', undefined, () => {
      this.store.commitSpoolVisibility(
        targets.map((target) => ({
          worktreeId: target.worktreeId,
          expectedInstanceId: target.instanceId,
          visibility: 'private'
        }))
      )
    })
  }

  rotateReplaced(entries: readonly ReplacedSpoolPublication[]): void {
    const replacements = new Map(
      entries.map((entry) => [entry.target.instanceId, this.createId()] as const)
    )
    const instanceIds = [...replacements.keys()]
    this.commitDenyFirstTransition(instanceIds, 'incarnation-changed', replacements, () => {
      this.store.commitSpoolVisibility(
        entries.map((entry) => ({
          worktreeId: entry.target.worktreeId,
          expectedInstanceId: entry.target.instanceId,
          visibility: 'private',
          spoolIncarnationId: entry.markerId,
          nextInstanceId: replacements.get(entry.target.instanceId)
        }))
      )
    })
  }

  private commitDenyFirstTransition(
    instanceIds: readonly string[],
    reason: SpoolVisibilityInvalidationReason,
    replacements: ReadonlyMap<string, string> | undefined,
    commit: () => void
  ): void {
    try {
      this.denyJournal.add(instanceIds)
    } catch (error) {
      this.publicationState.invalidate(instanceIds, reason, replacements ?? new Map())
      throw new SpoolVisibilityError('persistence-failed', { cause: error })
    }
    // Why: a durable deny precedes revocation, while journal removal follows
    // metadata, so every crash point remains Private after restart.
    this.publicationState.invalidate(instanceIds, reason, replacements ?? new Map())
    this.persist(() => {
      commit()
      this.denyJournal.remove(instanceIds)
    })
  }

  private persist(action: () => void): void {
    try {
      action()
    } catch (error) {
      if (error instanceof SpoolVisibilityError) {
        throw error
      }
      throw new SpoolVisibilityError('persistence-failed', { cause: error })
    }
  }
}
