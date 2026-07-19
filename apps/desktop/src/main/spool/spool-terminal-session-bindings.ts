import type { ExecutionHostId } from '../../shared/execution-host'
import type {
  SpoolLiveSessionDisplayIdentity,
  SpoolLiveSessionIdentity
} from './spool-live-session-display-identity'
import { spoolLiveTerminalSessionKey } from './spool-session-resolution'
import type {
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionProvider,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const MAX_TERMINAL_SESSION_BINDINGS = 2_000

export type SpoolTerminalSessionBinding = {
  sessionKey: string | null
  terminalHandle: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeId: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  title: string
} & SpoolLiveSessionIdentity

type SpoolTerminalSessionExecutionHostIdentity = {
  instanceId: string
  spoolIncarnationId: string
  actualHostScope: string
  executionHostId: string
}

/** Stabilizes owner-created PTY identity before asynchronous agent metadata arrives. */
export class SpoolTerminalSessionBindings {
  private readonly bindings = new Map<string, SpoolTerminalSessionBinding>()
  private readonly listeners = new Set<(instanceId: string) => void>()

  rememberContinued(
    worktree: SpoolPublicWorktreeInstance,
    record: SpoolOwnerHistoricalSessionRecord,
    terminalHandle: string
  ): void {
    this.rememberBinding({
      sessionKey: null,
      terminalHandle,
      executionHostId: record.executionHostId,
      actualHostScope: record.actualHostScope,
      worktreeId: worktree.worktreeId,
      worktreeInstanceId: worktree.instanceId,
      spoolIncarnationId: worktree.spoolIncarnationId,
      provider: record.provider,
      providerSessionId: record.providerSessionId,
      sessionKind: 'agent',
      agent: record.provider,
      title: record.title
    })
  }

  rememberSpawned(
    worktree: SpoolPublicWorktreeInstance,
    terminalHandle: string,
    session: { provider: SpoolSessionProvider; title: string } & SpoolLiveSessionDisplayIdentity
  ): void {
    // Why: the stable live key preserves tab identity while an authoritative hook
    // later supplies the provider session id needed for historical continuation.
    const displayIdentity: SpoolLiveSessionDisplayIdentity = session
    this.rememberBinding({
      sessionKey: spoolLiveTerminalSessionKey(worktree, terminalHandle),
      terminalHandle,
      executionHostId: worktree.ownerWorktree.executionHostId,
      actualHostScope: worktree.actualHostScope,
      worktreeId: worktree.worktreeId,
      worktreeInstanceId: worktree.instanceId,
      spoolIncarnationId: worktree.spoolIncarnationId,
      provider: session.provider,
      providerSessionId: null,
      ...displayIdentity,
      title: session.title
    })
  }

  observeProviderSession(
    terminalHandle: string,
    provider: 'claude' | 'codex',
    providerSessionId: string,
    expected: { worktreeId: string; worktreeInstanceId: string }
  ): SpoolTerminalSessionBinding | null {
    const binding = this.bindings.get(terminalHandle)
    if (
      !binding ||
      binding.worktreeId !== expected.worktreeId ||
      binding.worktreeInstanceId !== expected.worktreeInstanceId
    ) {
      return null
    }
    if (binding.provider === provider && binding.providerSessionId === providerSessionId) {
      return { ...binding }
    }
    // Why: one PTY can run consecutive agents; its authoritative live hook replaces stale identity.
    binding.provider = provider
    binding.providerSessionId = providerSessionId
    binding.sessionKind = 'agent'
    if (!(binding.agent === 'claude-agent-teams' && provider === 'claude')) {
      binding.agent = provider
    }
    // Why: the runtime snapshot that supplied this ID already invalidates the catalog.
    return { ...binding }
  }

  private rememberBinding(binding: SpoolTerminalSessionBinding): void {
    if (!binding.terminalHandle || binding.terminalHandle.length > 2048) {
      return
    }
    const replaced = this.bindings.get(binding.terminalHandle)
    if (replaced && sameTerminalSessionBinding(replaced, binding)) {
      // Why: repeated owner hooks refresh recency but cannot invalidate an
      // unchanged requester-visible session catalog.
      this.bindings.delete(binding.terminalHandle)
      this.bindings.set(binding.terminalHandle, binding)
      return
    }
    const changedInstances = new Set([binding.worktreeInstanceId])
    if (replaced) {
      changedInstances.add(replaced.worktreeInstanceId)
    }
    this.bindings.delete(binding.terminalHandle)
    this.bindings.set(binding.terminalHandle, binding)
    while (this.bindings.size > MAX_TERMINAL_SESSION_BINDINGS) {
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
  ): SpoolTerminalSessionBinding | null {
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
    worktree: SpoolTerminalSessionExecutionHostIdentity,
    terminalHandle: string
  ): SpoolTerminalSessionBinding | null {
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
        console.error('[spool] Terminal-session observer failed')
      }
    }
  }
}

function sameTerminalSessionBinding(
  left: SpoolTerminalSessionBinding,
  right: SpoolTerminalSessionBinding
): boolean {
  return (
    left.sessionKey === right.sessionKey &&
    left.terminalHandle === right.terminalHandle &&
    left.executionHostId === right.executionHostId &&
    left.actualHostScope === right.actualHostScope &&
    left.worktreeId === right.worktreeId &&
    left.worktreeInstanceId === right.worktreeInstanceId &&
    left.spoolIncarnationId === right.spoolIncarnationId &&
    left.provider === right.provider &&
    left.providerSessionId === right.providerSessionId &&
    left.sessionKind === right.sessionKind &&
    left.agent === right.agent &&
    left.title === right.title
  )
}
