import type {
  CoworkingExecutionHostSessionReadRequest,
  CoworkingSessionWorktreeIdentity
} from './session/source'

const MAX_OBSERVED_WORKTREES = 256

export type ObservedWorktreeProvenanceScope = Pick<
  CoworkingSessionWorktreeIdentity,
  'worktreeId' | 'instanceId' | 'coworkingIncarnationId' | 'actualHostScope'
>

/** Retains only exact host/worktree routes that may attest live provider identities. */
export class CoworkingObservedWorktreeProvenance {
  private readonly worktrees = new Map<string, ObservedWorktreeProvenanceScope>()

  remember(worktree: CoworkingSessionWorktreeIdentity): void {
    const key = observedWorktreeKey(worktree)
    this.worktrees.delete(key)
    this.worktrees.set(key, {
      worktreeId: worktree.worktreeId,
      instanceId: worktree.instanceId,
      coworkingIncarnationId: worktree.coworkingIncarnationId,
      actualHostScope: worktree.actualHostScope
    })
    while (this.worktrees.size > MAX_OBSERVED_WORKTREES) {
      const oldest = this.worktrees.keys().next().value
      if (!oldest) {
        break
      }
      this.worktrees.delete(oldest)
    }
  }

  resolve(
    request: CoworkingExecutionHostSessionReadRequest
  ): ObservedWorktreeProvenanceScope | undefined {
    return this.worktrees.get(observedWorktreeKeyFromRequest(request))
  }

  forget(worktree: CoworkingSessionWorktreeIdentity): void {
    this.worktrees.delete(observedWorktreeKey(worktree))
  }
}

function observedWorktreeKey(worktree: CoworkingSessionWorktreeIdentity): string {
  return JSON.stringify([
    worktree.target.executionHostId,
    worktree.worktreeId,
    worktree.instanceId,
    worktree.coworkingIncarnationId
  ])
}

function observedWorktreeKeyFromRequest(request: CoworkingExecutionHostSessionReadRequest): string {
  return JSON.stringify([
    request.executionHostId,
    request.worktreeId,
    request.worktreeInstanceId,
    request.coworkingIncarnationId
  ])
}
