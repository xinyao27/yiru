import type {
  CoworkingExecutionOperation,
  CoworkingSubscriptionOperation,
  CoworkingTerminalSubscriptionEvent
} from '../../shared/coworking/operation-contract'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { CoworkingExecutionError } from './execution-error'
import type { CoworkingHostOperationContext, CoworkingHostSubscription } from './execution-gateway'
import type { CoworkingTerminalHost } from './structured-host-adapter'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'
import type { YiruCoworkingHostTerminalLaunch } from './yiru-host-terminal-launch'

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const MAX_SCROLLBACK_ROWS = 50_000
const MAX_PENDING_SNAPSHOT_OUTPUT_BYTES = 2 * 1024 * 1024

type CoworkingTerminalRuntime = Pick<
  YiruRuntimeService,
  | 'showTerminal'
  | 'sendTerminal'
  | 'serializeTerminalBuffer'
  | 'subscribeToTerminalData'
  | 'subscribeToTerminalResize'
  | 'waitForTerminal'
  | 'updateRemoteDesktopViewer'
  | 'unregisterRemoteDesktopViewers'
>

type TerminalOperation = Extract<
  CoworkingExecutionOperation,
  {
    kind: 'terminal.input' | 'terminal.resize' | 'terminal.launchOptions' | 'terminal.create'
  }
>

type SequencedTerminalEvent =
  | { kind: 'snapshot'; data: string; cols: number; rows: number }
  | { kind: 'output'; data: string }
  | { kind: 'resized'; cols: number; rows: number }
  | { kind: 'closed' }

/** Adapts session-resolved terminal handles to the owner runtime's live PTY surface. */
export class YiruCoworkingHostTerminal implements CoworkingTerminalHost {
  private readonly viewportKeys = new Map<
    string,
    Map<string, { key: string; instanceId: string }>
  >()

  constructor(
    private readonly runtime: CoworkingTerminalRuntime,
    private readonly launch?: YiruCoworkingHostTerminalLaunch
  ) {}

  async invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: TerminalOperation,
    context: CoworkingHostOperationContext
  ): Promise<unknown> {
    if (operation.kind === 'terminal.launchOptions' || operation.kind === 'terminal.create') {
      if (!this.launch) {
        throw new CoworkingExecutionError('method_not_found')
      }
      return await this.launch.invoke(target, operation, context)
    }
    const terminal = await this.resolveTerminal(target, operation.terminalRef)
    const guard = context.admissionGuard
    if (!guard) {
      throw new CoworkingExecutionError('unauthorized')
    }
    if (operation.kind === 'terminal.input') {
      await this.runtime.sendTerminal(
        operation.terminalRef,
        { text: operation.data },
        {
          beforeWrite: async (ptyId) => {
            if (ptyId !== terminal.ptyId) {
              throw new CoworkingExecutionError('resource_not_found')
            }
            await guard.beforeSideEffect()
          }
        }
      )
      return { ok: true }
    }
    await guard.beforeSideEffect()
    const key = this.viewportKey(context.connectionId, operation.terminalRef)
    const applied = await this.runtime.updateRemoteDesktopViewer(
      terminal.ptyId,
      key,
      context.connectionId,
      operation.cols,
      operation.rows,
      true
    )
    if (!applied) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    this.rememberViewport(context.connectionId, target.instanceId, terminal.ptyId, key)
    return { ok: true }
  }

  subscribe(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingSubscriptionOperation, { kind: 'terminal.subscribe' }>,
    context: CoworkingHostOperationContext,
    emit: (event: unknown) => void
  ): CoworkingHostSubscription {
    let closed = false
    const cleanup = new Set<() => void>()
    const close = (): void => {
      if (closed) {
        return
      }
      closed = true
      for (const dispose of cleanup) {
        dispose()
      }
      cleanup.clear()
    }
    const subscription = { close }
    const abort = (): void => close()
    context.signal.addEventListener('abort', abort, { once: true })
    cleanup.add(() => context.signal.removeEventListener('abort', abort))
    void this.startSubscription(target, operation, context, emit, subscription, cleanup).catch(
      () => {
        if (!closed) {
          // Why: setup failure does not prove the PTY exited and must not make
          // provider continuation available while the agent may still run.
          emit({ kind: 'unavailable' } satisfies CoworkingTerminalSubscriptionEvent)
          close()
        }
      }
    )
    return subscription
  }

  closeConnection(connectionId: string): void {
    this.launch?.closeConnection(connectionId)
    const byPty = this.viewportKeys.get(connectionId)
    this.viewportKeys.delete(connectionId)
    for (const [ptyId, viewport] of byPty ?? []) {
      void this.runtime.unregisterRemoteDesktopViewers(ptyId, [viewport.key])
    }
  }

  revokeWorktree(connectionId: string, instanceId: string): void {
    const byPty = this.viewportKeys.get(connectionId)
    for (const [ptyId, viewport] of byPty ?? []) {
      if (viewport.instanceId === instanceId) {
        byPty?.delete(ptyId)
        void this.runtime.unregisterRemoteDesktopViewers(ptyId, [viewport.key])
      }
    }
    if (byPty?.size === 0) {
      this.viewportKeys.delete(connectionId)
    }
  }

  private async startSubscription(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingSubscriptionOperation, { kind: 'terminal.subscribe' }>,
    context: CoworkingHostOperationContext,
    emit: (event: unknown) => void,
    subscription: CoworkingHostSubscription,
    cleanup: Set<() => void>
  ): Promise<void> {
    const terminal = await this.resolveTerminal(target, operation.terminalRef)
    context.signal.throwIfAborted()
    const pending: { data: string; seq?: number; rawLength?: number }[] = []
    let pendingBytes = 0
    let pendingOverflow = false
    let snapshotReady = false
    let sequence = 0
    const emitEvent = (event: SequencedTerminalEvent): void => {
      if (event.kind === 'closed') {
        emit(event)
      } else {
        emit({ ...event, sequence: ++sequence })
      }
    }
    const unsubscribeData = this.runtime.subscribeToTerminalData(terminal.ptyId, (data, meta) => {
      if (!snapshotReady) {
        pendingBytes += Buffer.byteLength(data, 'utf8')
        if (pendingBytes > MAX_PENDING_SNAPSHOT_OUTPUT_BYTES) {
          pendingOverflow = true
          pending.length = 0
          return
        }
        pending.push({ data, seq: meta?.seq, rawLength: meta?.rawLength })
        return
      }
      emitEvent({ kind: 'output', data })
    })
    const unsubscribeResize = this.runtime.subscribeToTerminalResize(terminal.ptyId, (event) => {
      if (snapshotReady) {
        emitEvent({ kind: 'resized', cols: event.cols, rows: event.rows })
      }
    })
    cleanup.add(unsubscribeData)
    cleanup.add(unsubscribeResize)
    const snapshot = await this.readBoundedSnapshot(terminal.ptyId, operation.scrollbackRows)
    context.signal.throwIfAborted()
    if (pendingOverflow) {
      throw new CoworkingExecutionError('result_too_large')
    }
    emitEvent({ kind: 'snapshot', data: snapshot.data, cols: snapshot.cols, rows: snapshot.rows })
    snapshotReady = true
    for (const chunk of outputAfterSnapshot(pending, snapshot.seq)) {
      emitEvent({ kind: 'output', data: chunk })
    }
    // Why: replayed snapshot-gap output must not stay retained for the stream lifetime.
    pending.length = 0
    pendingBytes = 0
    void this.runtime
      .waitForTerminal(operation.terminalRef, { condition: 'exit', signal: context.signal })
      .then(() => {
        emitEvent({ kind: 'closed' })
        subscription.close()
      })
      .catch(() => {
        if (!context.signal.aborted) {
          emit({ kind: 'unavailable' } satisfies CoworkingTerminalSubscriptionEvent)
          subscription.close()
        }
      })
  }

  private async resolveTerminal(target: CoworkingPublicWorktreeInstance, handle: string) {
    const terminal = await this.runtime.showTerminal(handle)
    if (
      !terminal.ptyId ||
      terminal.worktreeId !== target.worktreeId ||
      terminal.worktreeInstanceId !== target.instanceId
    ) {
      throw new CoworkingExecutionError('resource_not_found')
    }
    return { ptyId: terminal.ptyId }
  }

  private async readBoundedSnapshot(ptyId: string, requestedRows?: number) {
    const requested = Math.max(0, Math.min(MAX_SCROLLBACK_ROWS, requestedRows ?? 1_000))
    const candidates = [...new Set([requested, 1_000, 250, 25, 0])]
    for (const scrollbackRows of candidates) {
      const snapshot = await this.runtime.serializeTerminalBuffer(ptyId, { scrollbackRows })
      if (!snapshot) {
        break
      }
      const data = `${snapshot.scrollbackAnsi ?? ''}${snapshot.data}`
      if (Buffer.byteLength(data, 'utf8') <= MAX_SNAPSHOT_BYTES) {
        return { ...snapshot, data }
      }
    }
    throw new CoworkingExecutionError('result_too_large')
  }

  private viewportKey(connectionId: string, terminalHandle: string): string {
    return `coworking:${connectionId}:${terminalHandle}`
  }

  private rememberViewport(
    connectionId: string,
    instanceId: string,
    ptyId: string,
    key: string
  ): void {
    let byPty = this.viewportKeys.get(connectionId)
    if (!byPty) {
      byPty = new Map()
      this.viewportKeys.set(connectionId, byPty)
    }
    byPty.set(ptyId, { key, instanceId })
  }
}

function outputAfterSnapshot(
  pending: readonly { data: string; seq?: number; rawLength?: number }[],
  snapshotSeq: number | undefined
): string[] {
  return pending.flatMap((chunk) => {
    if (snapshotSeq === undefined || chunk.seq === undefined || chunk.rawLength === undefined) {
      return [chunk.data]
    }
    if (chunk.seq <= snapshotSeq) {
      return []
    }
    const start = chunk.seq - chunk.rawLength
    return [start < snapshotSeq ? chunk.data.slice(snapshotSeq - start) : chunk.data]
  })
}
