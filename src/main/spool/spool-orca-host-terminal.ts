import type {
  SpoolExecutionOperation,
  SpoolMutationResult,
  SpoolSubscriptionOperation,
  SpoolTerminalSubscriptionEvent
} from '../../shared/spool/spool-operation-contract'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { SpoolHostOperationContext, SpoolHostSubscription } from './spool-execution-gateway'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolTerminalSubscriptionHost } from './spool-structured-host-adapter'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const MAX_SCROLLBACK_ROWS = 50_000
const MAX_PENDING_SNAPSHOT_OUTPUT_BYTES = 2 * 1024 * 1024

type SpoolTerminalRuntime = Pick<
  OrcaRuntimeService,
  | 'showTerminal'
  | 'sendTerminal'
  | 'serializeTerminalBuffer'
  | 'subscribeToTerminalData'
  | 'subscribeToTerminalResize'
  | 'waitForTerminal'
  | 'updateRemoteDesktopViewer'
  | 'unregisterRemoteDesktopViewers'
>

type TerminalMutation = Extract<
  SpoolExecutionOperation,
  { kind: 'terminal.input' | 'terminal.resize' }
>

type SequencedTerminalEvent =
  | { kind: 'snapshot'; data: string; cols: number; rows: number }
  | { kind: 'output'; data: string }
  | { kind: 'resized'; cols: number; rows: number }
  | { kind: 'closed' }

/** Adapts session-resolved terminal handles to the owner runtime's live PTY surface. */
export class OrcaSpoolHostTerminal implements SpoolTerminalSubscriptionHost {
  private readonly viewportKeys = new Map<
    string,
    Map<string, { key: string; instanceId: string }>
  >()

  constructor(private readonly runtime: SpoolTerminalRuntime) {}

  async invoke(
    target: SpoolPublicWorktreeInstance,
    operation: TerminalMutation,
    context: SpoolHostOperationContext
  ): Promise<SpoolMutationResult> {
    const terminal = await this.resolveTerminal(target, operation.terminalRef)
    const guard = context.admissionGuard
    if (!guard) {
      throw new SpoolExecutionError('unauthorized')
    }
    if (operation.kind === 'terminal.input') {
      await this.runtime.sendTerminal(
        operation.terminalRef,
        { text: operation.data },
        {
          beforeWrite: async (ptyId) => {
            if (ptyId !== terminal.ptyId) {
              throw new SpoolExecutionError('resource_not_found')
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
      throw new SpoolExecutionError('resource_unavailable')
    }
    this.rememberViewport(context.connectionId, target.instanceId, terminal.ptyId, key)
    return { ok: true }
  }

  subscribe(
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolSubscriptionOperation, { kind: 'terminal.subscribe' }>,
    context: SpoolHostOperationContext,
    emit: (event: unknown) => void
  ): SpoolHostSubscription {
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
          emit({ kind: 'closed' } satisfies SpoolTerminalSubscriptionEvent)
          close()
        }
      }
    )
    return subscription
  }

  closeConnection(connectionId: string): void {
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
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolSubscriptionOperation, { kind: 'terminal.subscribe' }>,
    context: SpoolHostOperationContext,
    emit: (event: unknown) => void,
    subscription: SpoolHostSubscription,
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
      throw new SpoolExecutionError('result_too_large')
    }
    emitEvent({ kind: 'snapshot', data: snapshot.data, cols: snapshot.cols, rows: snapshot.rows })
    snapshotReady = true
    for (const chunk of outputAfterSnapshot(pending, snapshot.seq)) {
      emitEvent({ kind: 'output', data: chunk })
    }
    void this.runtime
      .waitForTerminal(operation.terminalRef, { condition: 'exit', signal: context.signal })
      .then(() => {
        emitEvent({ kind: 'closed' })
        subscription.close()
      })
      .catch(() => {})
  }

  private async resolveTerminal(target: SpoolPublicWorktreeInstance, handle: string) {
    const terminal = await this.runtime.showTerminal(handle)
    if (!terminal.ptyId || terminal.worktreeId !== target.worktreeId) {
      throw new SpoolExecutionError('resource_not_found')
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
    throw new SpoolExecutionError('result_too_large')
  }

  private viewportKey(connectionId: string, terminalHandle: string): string {
    return `spool:${connectionId}:${terminalHandle}`
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
