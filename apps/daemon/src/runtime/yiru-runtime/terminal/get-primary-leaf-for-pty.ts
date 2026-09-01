import type { RuntimeTerminalSummary } from '@yiru/runtime-protocol/workbench/runtime-types'

import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from '../model/terminal-records'
import type {
  MessageWaitResult,
  MessageWaiter,
  TerminalHandleRecord
} from '../model/terminal-startup'
import { MESSAGE_WAIT_DEFAULT_TIMEOUT_MS } from '../model/terminal-wait-readiness'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { getLatestPtyTitle } from '../model/worktree-status'
import { RuntimeTerminalSetPtyManagementTitleFromObservedTitle } from './set-pty-management-title-from-observed-title'

export abstract class RuntimeTerminalGetPrimaryLeafForPty extends RuntimeTerminalSetPtyManagementTitleFromObservedTitle {
  protected getPrimaryLeafForPty(ptyId: string): RuntimeLeafRecord | null {
    return this.getLeavesForPty(ptyId)[0] ?? null
  }

  deliverPendingMessagesForHandle(handle: string): void {
    try {
      const { leaf } = this.getLiveLeafForHandle(handle)
      if (leaf.lastAgentStatus === 'idle') {
        this.deliverPendingMessages(leaf)
      }
    } catch {
      // Unknown or stale handles cannot be pushed immediately; the persisted
      // message remains available via explicit check or future idle delivery.
    }
  }

  // Why: after a message is inserted for a recipient, any blocking
  // orchestration.check --wait calls watching that handle must be woken
  // so they can return the new message immediately instead of polling.

  notifyMessageArrived(handle: string, messageType?: string): void {
    const waiters = this.terminalSessions.listMessageWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      // Why: a coordinator waiting for worker_done/escalation should not be
      // woken by worker heartbeat noise and mistake that empty read for idleness.
      if (messageType && waiter.typeFilter && !waiter.typeFilter.includes(messageType)) {
        continue
      }
      this.resolveMessageWaiter(waiter, 'notified')
    }
  }

  waitForMessage(
    handle: string,
    options?: {
      typeFilter?: string[]
      timeoutMs?: number
      signal?: AbortSignal
      exclusive?: boolean
    }
  ): Promise<MessageWaitResult> {
    return new Promise((resolve) => {
      const currentWaiters = this.terminalSessions.listMessageWaiters(handle)
      if (options?.exclusive && currentWaiters.length > 0) {
        resolve('waiter_exists')
        return
      }
      const timeoutMs = options?.timeoutMs ?? MESSAGE_WAIT_DEFAULT_TIMEOUT_MS

      const waiter: MessageWaiter = {
        handle,
        typeFilter: options?.typeFilter,
        resolve,
        timeout: null,
        abortCleanup: null
      }

      // Why: if the caller aborts (socket closed on the RPC side — see design
      // doc §3.1 counter-lifecycle), resolve immediately so the long-poll slot
      // is released instead of counting down the full timeoutMs with a dead
      // client on the other end.
      const signal = options?.signal
      const onAbort = (): void => {
        this.removeMessageWaiter(waiter)
        resolve('cancelled')
      }
      if (signal) {
        if (signal.aborted) {
          resolve('cancelled')
          return
        }
        waiter.abortCleanup = () => signal.removeEventListener('abort', onAbort)
        signal.addEventListener('abort', onAbort, { once: true })
      }

      waiter.timeout = setTimeout(() => {
        this.removeMessageWaiter(waiter)
        resolve('timed_out')
      }, timeoutMs)

      this.terminalSessions.addMessageWaiter(waiter)
    })
  }

  cancelMessageWaiters(handle: string): void {
    for (const waiter of this.terminalSessions.listMessageWaiters(handle)) {
      this.resolveMessageWaiter(waiter, 'cancelled')
    }
  }

  protected resolveMessageWaiter(waiter: MessageWaiter, result: MessageWaitResult): void {
    this.removeMessageWaiter(waiter)
    waiter.resolve(result)
  }

  protected removeMessageWaiter(waiter: MessageWaiter): void {
    if (waiter.timeout) {
      clearTimeout(waiter.timeout)
      waiter.timeout = null
    }
    if (waiter.abortCleanup) {
      waiter.abortCleanup()
      waiter.abortCleanup = null
    }
    this.terminalSessions.removeMessageWaiter(waiter)
  }

  protected buildPtyTerminalSummary(
    pty: RuntimePtyWorktreeRecord,
    worktreesById: Map<string, ResolvedWorktree>
  ): RuntimeTerminalSummary {
    const worktree = worktreesById.get(pty.worktreeId)

    return {
      handle: this.issuePtyHandle(pty),
      ptyId: pty.ptyId,
      worktreeId: pty.worktreeId,
      worktreeInstanceId: pty.worktreeInstanceId,
      worktreePath: worktree?.path ?? '',
      branch: worktree?.branch ?? '',
      tabId: `pty:${pty.ptyId}`,
      leafId: `pty:${pty.ptyId}`,
      title: getLatestPtyTitle(pty),
      connected: pty.connected,
      writable: pty.connected,
      lastOutputAt: pty.lastOutputAt,
      preview: pty.preview
    }
  }

  protected getLiveLeafForHandle(handle: string): {
    record: TerminalHandleRecord
    leaf: RuntimeLeafRecord
  } {
    this.assertGraphReady()
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record || record.runtimeId !== this.runtimeId) {
      throw new Error('terminal_handle_stale')
    }
    if (record.rendererGraphEpoch !== this.terminalSessions.getGraphEpoch()) {
      throw new Error('terminal_handle_stale')
    }

    const leaf = this.terminalSessions.getGraphLeafByKey(
      this.getLeafKey(record.tabId, record.leafId)
    )
    if (!leaf || leaf.ptyId !== record.ptyId || leaf.ptyGeneration !== record.ptyGeneration) {
      throw new Error('terminal_handle_stale')
    }
    return { record, leaf }
  }

  protected getLivePtyForHandle(handle: string): {
    record: TerminalHandleRecord
    pty: RuntimePtyWorktreeRecord
  } | null {
    let record = this.terminalSessions.getTerminalHandle(handle)
    if (!record) {
      const ptyId = this.terminalSessions.getPtyIdForTerminalHandle(handle)
      const pty = ptyId ? this.terminalSessions.getPtyRecord(ptyId) : null
      if (pty) {
        // Why: graph reload/unavailability clears renderer handle records, but
        // runtime-owned PTY handles remain the caller's control identity.
        this.issuePtyHandle(pty)
        record = this.terminalSessions.getTerminalHandle(handle)
      }
    }
    if (!record || record.runtimeId !== this.runtimeId || !record.tabId.startsWith('pty:')) {
      return null
    }
    if (!record.ptyId) {
      return null
    }
    const resolvedPtyId = this.resolveLocalRuntimeTerminalPtyId(record.ptyId)
    const pty = this.terminalSessions.getPtyRecord(resolvedPtyId)
    if (!pty || pty.ptyId !== resolvedPtyId) {
      return null
    }
    // Why: renderer adoption can race with CLI reads. If this synthetic PTY
    // handle is valid, keep ptyId -> handle populated so summaries do not mint
    // a second handle for the same terminal.
    this.terminalSessions.bindTerminalHandleToPty(record.ptyId, handle)
    return { record, pty }
  }
}
