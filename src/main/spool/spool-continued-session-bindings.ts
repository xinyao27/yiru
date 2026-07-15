import type {
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const MAX_CONTINUED_BINDINGS = 2_000

export type SpoolContinuedSessionBinding = {
  terminalHandle: string
  executionHostId: SpoolOwnerHistoricalSessionRecord['executionHostId']
  actualHostScope: string
  worktreeId: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: SpoolOwnerHistoricalSessionRecord['provider']
  providerSessionId: string
  title: string
}

type SpoolContinuedSessionExecutionHostIdentity = {
  instanceId: string
  spoolIncarnationId: string
  actualHostScope: string
  executionHostId: string
}

/** Bridges a resumed PTY to its provider session before the first agent hook arrives. */
export class SpoolContinuedSessionBindings {
  private readonly bindings = new Map<string, SpoolContinuedSessionBinding>()
  private readonly listeners = new Set<(instanceId: string) => void>()

  remember(
    worktree: SpoolPublicWorktreeInstance,
    record: SpoolOwnerHistoricalSessionRecord,
    terminalHandle: string
  ): void {
    if (!terminalHandle || terminalHandle.length > 2048) {
      return
    }
    const changedInstances = new Set([worktree.instanceId])
    const replaced = this.bindings.get(terminalHandle)
    if (replaced) {
      changedInstances.add(replaced.worktreeInstanceId)
    }
    this.bindings.delete(terminalHandle)
    this.bindings.set(terminalHandle, {
      terminalHandle,
      executionHostId: record.executionHostId,
      actualHostScope: record.actualHostScope,
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
      const evicted = this.bindings.get(oldest)
      if (evicted) {
        changedInstances.add(evicted.worktreeInstanceId)
      }
      this.bindings.delete(oldest)
    }
    for (const instanceId of changedInstances) {
      this.emitChange(instanceId)
    }
  }

  resolve(
    worktree: Pick<
      SpoolSessionWorktreeIdentity,
      'instanceId' | 'spoolIncarnationId' | 'actualHostScope' | 'target'
    >,
    terminalHandle: string
  ): SpoolContinuedSessionBinding | null {
    return this.resolveForExecutionHost(
      {
        instanceId: worktree.instanceId,
        spoolIncarnationId: worktree.spoolIncarnationId,
        actualHostScope: worktree.actualHostScope,
        executionHostId: worktree.target.executionHostId
      },
      terminalHandle
    )
  }

  resolveForExecutionHost(
    worktree: SpoolContinuedSessionExecutionHostIdentity,
    terminalHandle: string
  ): SpoolContinuedSessionBinding | null {
    const binding = this.bindings.get(terminalHandle)
    return binding &&
      binding.worktreeInstanceId === worktree.instanceId &&
      binding.spoolIncarnationId === worktree.spoolIncarnationId &&
      binding.actualHostScope === worktree.actualHostScope &&
      binding.executionHostId === worktree.executionHostId
      ? { ...binding }
      : null
  }

  reconcile(
    worktree: Pick<SpoolPublicWorktreeInstance, 'worktreeId' | 'instanceId' | 'spoolIncarnationId'>,
    liveHandles: ReadonlySet<string>
  ): void {
    const changedInstances = new Set<string>()
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
        changedInstances.add(binding.worktreeInstanceId)
      }
    }
    for (const instanceId of changedInstances) {
      this.emitChange(instanceId)
    }
  }

  subscribe(listener: (instanceId: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emitChange(instanceId: string): void {
    for (const listener of this.listeners) {
      try {
        listener(instanceId)
      } catch {
        // Why: a catalog observer cannot turn a completed terminal spawn into a failed mutation.
        console.error('[spool] Continued-session observer failed')
      }
    }
  }
}
