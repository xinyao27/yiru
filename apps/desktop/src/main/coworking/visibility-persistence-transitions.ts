import type { Store, CoworkingVisibilityCommitChange } from '../persistence'
import type { CoworkingVisibilityDenyJournal } from './visibility-deny-journal'
import { CoworkingVisibilityError } from './visibility-errors'
import type {
  CoworkingVisibilityInvalidationReason,
  CoworkingWorktreePublicationState
} from './worktree-publication-state'
import type {
  PreparedCoworkingPublication,
  ReplacedCoworkingPublication
} from './worktree-publication-validation'

export type CoworkingPersistedWorktreeIdentity = {
  worktreeId: string
  instanceId: string
}

export type CoworkingVisibilityStore = Pick<
  Store,
  'commitCoworkingVisibility' | 'getAllWorktreeMeta' | 'getWorktreeMeta'
>

export type CoworkingPreparedPublicationPersistence = {
  persistProofs(): void
  completeAttestation(): void
}

export function createEmptyCoworkingPublicationPersistence(): CoworkingPreparedPublicationPersistence {
  return { persistProofs: () => {}, completeAttestation: () => {} }
}

export class CoworkingVisibilityPersistenceTransitions {
  constructor(
    private readonly store: CoworkingVisibilityStore,
    private readonly denyJournal: Pick<
      CoworkingVisibilityDenyJournal,
      'add' | 'remove' | 'snapshot'
    >,
    private readonly publicationState: CoworkingWorktreePublicationState,
    private readonly createId: () => string
  ) {}

  recoverDenyJournal(): void {
    const denied = [...this.denyJournal.snapshot()]
    if (denied.length === 0) {
      return
    }
    const deniedSet = new Set(denied)
    const changes: CoworkingVisibilityCommitChange[] = []
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
        this.store.commitCoworkingVisibility(changes)
      }
      this.denyJournal.remove(denied)
    })
  }

  commitPublic(
    entries: readonly PreparedCoworkingPublication[],
    preparedPersistence: CoworkingPreparedPublicationPersistence
  ): void {
    const instanceIds = entries.map((entry) => entry.target.instanceId)
    try {
      preparedPersistence.persistProofs()
      // Why: a publication is not observable until both durable metadata and
      // any older crash-deny agree that this instance is Public.
      this.store.commitCoworkingVisibility(
        entries.map((entry) => ({
          worktreeId: entry.target.worktreeId,
          expectedInstanceId: entry.target.instanceId,
          visibility: 'public',
          coworkingIncarnationId: entry.markerId
        }))
      )
      this.denyJournal.remove(instanceIds)
      preparedPersistence.completeAttestation()
    } catch (error) {
      this.publicationState.suspend(instanceIds, 'incarnation-unavailable')
      throw new CoworkingVisibilityError('persistence-failed', { cause: error })
    }
    for (const entry of entries) {
      this.publicationState.publish(entry)
    }
  }

  makePrivate(targets: readonly CoworkingPersistedWorktreeIdentity[]): void {
    const instanceIds = targets.map((target) => target.instanceId)
    this.commitDenyFirstTransition(instanceIds, 'private', undefined, () => {
      this.store.commitCoworkingVisibility(
        targets.map((target) => ({
          worktreeId: target.worktreeId,
          expectedInstanceId: target.instanceId,
          visibility: 'private'
        }))
      )
    })
  }

  rotateReplaced(entries: readonly ReplacedCoworkingPublication[]): void {
    const replacements = new Map(
      entries.map((entry) => [entry.target.instanceId, this.createId()] as const)
    )
    const instanceIds = [...replacements.keys()]
    this.commitDenyFirstTransition(instanceIds, 'incarnation-changed', replacements, () => {
      this.store.commitCoworkingVisibility(
        entries.map((entry) => ({
          worktreeId: entry.target.worktreeId,
          expectedInstanceId: entry.target.instanceId,
          visibility: 'private',
          coworkingIncarnationId: entry.markerId,
          nextInstanceId: replacements.get(entry.target.instanceId)
        }))
      )
    })
  }

  private commitDenyFirstTransition(
    instanceIds: readonly string[],
    reason: CoworkingVisibilityInvalidationReason,
    replacements: ReadonlyMap<string, string> | undefined,
    commit: () => void
  ): void {
    try {
      this.denyJournal.add(instanceIds)
    } catch (error) {
      this.publicationState.invalidate(instanceIds, reason, replacements ?? new Map())
      throw new CoworkingVisibilityError('persistence-failed', { cause: error })
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
      if (error instanceof CoworkingVisibilityError) {
        throw error
      }
      throw new CoworkingVisibilityError('persistence-failed', { cause: error })
    }
  }
}
