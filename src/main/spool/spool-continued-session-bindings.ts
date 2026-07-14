import type { SpoolOwnerHistoricalSessionRecord } from './spool-session-source'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const MAX_CONTINUED_BINDINGS = 2_000

export type SpoolContinuedSessionBinding = {
  terminalHandle: string
  executionHostId: SpoolOwnerHistoricalSessionRecord['executionHostId']
  worktreeId: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: SpoolOwnerHistoricalSessionRecord['provider']
  providerSessionId: string
  title: string
}

/** Bridges a resumed PTY to its provider session before the first agent hook arrives. */
export class SpoolContinuedSessionBindings {
  private readonly bindings = new Map<string, SpoolContinuedSessionBinding>()
  private readonly listeners = new Set<() => void>()

  remember(
    worktree: SpoolPublicWorktreeInstance,
    record: SpoolOwnerHistoricalSessionRecord,
    terminalHandle: string
  ): void {
    if (!terminalHandle || terminalHandle.length > 2048) {
      return
    }
    this.bindings.delete(terminalHandle)
    this.bindings.set(terminalHandle, {
      terminalHandle,
      executionHostId: record.executionHostId,
      worktreeId: worktree.worktreeId,
      worktreeInstanceId: worktree.instanceId,
      spoolIncarnationId: worktree.spoolIncarnationId,
      provider: record.provider,
      providerSessionId: record.providerSessionId,
      title: record.title
    })
    while (this.bindings.size > MAX_CONTINUED_BINDINGS) {
      const oldest = this.bindings.keys().next().value
      if (!oldest) {
        break
      }
      this.bindings.delete(oldest)
    }
    this.emitChange()
  }

  resolve(
    worktree: Pick<SpoolPublicWorktreeInstance, 'instanceId' | 'spoolIncarnationId' | 'target'>,
    terminalHandle: string
  ): SpoolContinuedSessionBinding | null {
    const binding = this.bindings.get(terminalHandle)
    return binding &&
      binding.worktreeInstanceId === worktree.instanceId &&
      binding.spoolIncarnationId === worktree.spoolIncarnationId &&
      binding.executionHostId === worktree.target.executionHostId
      ? { ...binding }
      : null
  }

  reconcile(
    worktree: Pick<SpoolPublicWorktreeInstance, 'worktreeId' | 'instanceId' | 'spoolIncarnationId'>,
    liveHandles: ReadonlySet<string>
  ): void {
    let changed = false
    for (const [handle, binding] of this.bindings) {
      const replaced =
        binding.worktreeId === worktree.worktreeId &&
        (binding.worktreeInstanceId !== worktree.instanceId ||
          binding.spoolIncarnationId !== worktree.spoolIncarnationId)
      const closed =
        binding.worktreeInstanceId === worktree.instanceId &&
        binding.spoolIncarnationId === worktree.spoolIncarnationId &&
        !liveHandles.has(handle)
      if (replaced || closed) {
        this.bindings.delete(handle)
        changed = true
      }
    }
    if (changed) {
      this.emitChange()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Why: a catalog observer cannot turn a completed terminal spawn into a failed mutation.
        console.error('[spool] Continued-session observer failed')
      }
    }
  }
}
