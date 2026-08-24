import { formatMessagesForInjection } from '~main/runtime/orchestration/formatter'
import type { RuntimeTerminalWait } from '~shared/runtime-types'

import { isCursorAgentOrchestrationTarget } from '../model/terminal-records'
import type { RuntimeLeafRecord } from '../model/terminal-records'
import type { TerminalWaiter } from '../model/terminal-startup'
import { RuntimeTerminalStartTuiIdleFallbackPoll } from './start-tui-idle-fallback-poll'

export abstract class RuntimeTerminalDeliverPendingMessages extends RuntimeTerminalStartTuiIdleFallbackPoll {
  protected deliverPendingMessages(leaf: RuntimeLeafRecord): void {
    if (!this._orchestrationDb) {
      return
    }

    const handle = this.terminalSessions.getTerminalHandleForLeafKey(
      this.getLeafKey(leaf.tabId, leaf.leafId)
    )
    if (!handle) {
      return
    }

    const unread = this._orchestrationDb.getUndeliveredUnreadMessages(handle)
    if (unread.length === 0) {
      return
    }

    if (!leaf.writable || !leaf.ptyId) {
      return
    }

    const payload = formatMessagesForInjection(
      unread,
      this.getTerminalOrchestrationCliCommand(handle)
    )
    const wrote = this.ptyController?.write(leaf.ptyId, payload) ?? false
    if (!wrote) {
      return
    }

    // The active coordinator prompt is user-owned input, so push-on-idle must not synthesize Enter.
    if (this._orchestrationDb.getActiveCoordinatorRun()?.coordinator_handle === handle) {
      this._orchestrationDb.markAsDelivered(unread.map((m) => m.id))
      return
    }

    const tabTitle = this.terminalSessions.getGraphTab(leaf.tabId)?.title
    if (isCursorAgentOrchestrationTarget(leaf, tabTitle)) {
      // Why: Cursor Agent treats injected PTY text as editable prompt input.
      // Push-on-idle may surface the message, but submitting it must stay
      // under user control.
      this._orchestrationDb.markAsDelivered(unread.map((m) => m.id))
      return
    }

    // Why: Claude Code treats large single PTY writes as paste events and
    // swallows a \r included in the same write. Send Enter separately after
    // a delay so the agent processes the pasted message first. Stamp
    // `delivered_at` only after \r is confirmed, so failed deliveries stay
    // queued.
    //
    // Important (design doc §3.2, feedback #2): we stamp `delivered_at` here
    // instead of flipping `read`. `read` is reserved for "a check-caller
    // consumed this message." Flipping `read` on push-on-idle would hide the
    // message from the coordinator's next `check --unread`, which is the
    // exact bug feedback #2 reported. The two bits must stay independent.
    const ptyId = leaf.ptyId
    setTimeout(() => {
      try {
        if (!leaf.writable) {
          return
        }
        const submitted = this.ptyController?.write(ptyId, '\r') ?? false
        if (submitted) {
          this._orchestrationDb?.markAsDelivered(unread.map((m) => m.id))
        }
      } catch {
        // Terminal may have closed during the delay — messages stay queued
        // (delivered_at still NULL) and will be re-delivered on the next
        // idle transition.
      }
    }, 500)
  }

  protected resolveWaiter(waiter: TerminalWaiter, result: RuntimeTerminalWait): void {
    this.removeWaiter(waiter)
    waiter.resolve(result)
  }

  protected bindTerminalWaiterAbort(
    waiter: TerminalWaiter,
    signal: AbortSignal | undefined
  ): boolean {
    if (!signal) {
      return true
    }
    if (signal.aborted) {
      return false
    }
    const onAbort = (): void => {
      this.removeWaiter(waiter)
      waiter.reject(new Error('request_aborted'))
    }
    waiter.abortCleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    return true
  }

  protected rejectWaitersForHandle(handle: string, code: string): void {
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      this.removeWaiter(waiter)
      waiter.reject(new Error(code))
    }
  }

  protected rejectAllWaiters(code: string): void {
    for (const handle of this.terminalSessions.listTerminalWaiterHandles()) {
      this.rejectWaitersForHandle(handle, code)
    }
  }

  protected removeWaiter(waiter: TerminalWaiter): void {
    if (waiter.timeout) {
      clearTimeout(waiter.timeout)
    }
    if (waiter.pollInterval) {
      clearInterval(waiter.pollInterval)
    }
    if (waiter.abortCleanup) {
      waiter.abortCleanup()
      waiter.abortCleanup = null
    }
    this.terminalSessions.removeTerminalWaiter(waiter)
  }

  protected getLeafKey(tabId: string, leafId: string): string {
    return `${tabId}::${leafId}`
  }

  // ── Browser automation ──
}
