import type {
  SpoolExecutionHostSessionReadRequest,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'

const MAX_OBSERVED_WORKTREES = 256

export type ObservedWorktreeProvenanceScope = Pick<
  SpoolSessionWorktreeIdentity,
  'worktreeId' | 'instanceId' | 'spoolIncarnationId' | 'actualHostScope'
>

/** Retains only exact host/worktree routes that may attest live provider identities. */
export class SpoolObservedWorktreeProvenance {
  private readonly worktrees = new Map<string, ObservedWorktreeProvenanceScope>()

  remember(worktree: SpoolSessionWorktreeIdentity): void {
    const key = observedWorktreeKey(worktree)
    this.worktrees.delete(key)
    this.worktrees.set(key, {
      worktreeId: worktree.worktreeId,
      instanceId: worktree.instanceId,
      spoolIncarnationId: worktree.spoolIncarnationId,
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
    request: SpoolExecutionHostSessionReadRequest
  ): ObservedWorktreeProvenanceScope | undefined {
    return this.worktrees.get(observedWorktreeKeyFromRequest(request))
  }

  forget(worktree: SpoolSessionWorktreeIdentity): void {
    this.worktrees.delete(observedWorktreeKey(worktree))
  }
}

function observedWorktreeKey(worktree: SpoolSessionWorktreeIdentity): string {
  return JSON.stringify([
    worktree.target.executionHostId,
    worktree.worktreeId,
    worktree.instanceId,
    worktree.spoolIncarnationId
  ])
}

function observedWorktreeKeyFromRequest(request: SpoolExecutionHostSessionReadRequest): string {
  return JSON.stringify([
    request.executionHostId,
    request.worktreeId,
    request.worktreeInstanceId,
    request.spoolIncarnationId
  ])
}
