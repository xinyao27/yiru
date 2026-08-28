import type { RuntimeTerminalRead } from '@yiru/runtime-protocol/workbench/runtime-types'

import { readTerminalTail } from '../model/terminal-read'
import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from '../model/terminal-records'
import type { TerminalHandleRecord } from '../model/terminal-startup'
import { buildPtyTerminalWaitResult, buildTerminalWaitResult } from '../model/terminal-wait-result'
import { RuntimeTerminalGetPrimaryLeafForPty } from './get-primary-leaf-for-pty'

export abstract class RuntimeTerminalGetRuntimeOwnedPtyForHandle extends RuntimeTerminalGetPrimaryLeafForPty {
  protected getRuntimeOwnedPtyForHandle(handle: string): {
    record: TerminalHandleRecord
    pty: RuntimePtyWorktreeRecord
  } | null {
    const syntheticPty = this.getLivePtyForHandle(handle)
    if (syntheticPty) {
      return syntheticPty
    }
    try {
      const liveLeaf = this.getLiveLeafForHandle(handle)
      const ptyId = liveLeaf.leaf.ptyId
        ? this.resolveLocalRuntimeTerminalPtyId(liveLeaf.leaf.ptyId)
        : null
      const pty = ptyId ? this.terminalSessions.getPtyRecord(ptyId) : null
      // Why: renderer reload adopts the assistant's synthetic handle into the
      // rebuilt leaf graph; reveal must follow that live handle back to its PTY.
      return pty ? { record: liveLeaf.record, pty } : null
    } catch {
      return null
    }
  }

  protected readPtyTerminal(
    handle: string,
    pty: RuntimePtyWorktreeRecord,
    opts: { cursor?: number; limit?: number } = {}
  ): RuntimeTerminalRead {
    return readTerminalTail({
      handle,
      status: pty.connected ? 'running' : pty.lastExitCode !== null ? 'exited' : 'unknown',
      completedLines: pty.tailBuffer,
      partialLine: pty.tailPartialLine,
      completedLineCount: pty.tailLinesTotal,
      bufferTruncated: pty.tailTruncated,
      cursor: opts.cursor,
      limit: opts.limit
    })
  }

  protected issueHandle(leaf: RuntimeLeafRecord): string {
    return this.terminalSessions.issueLeafHandle(this.runtimeId, leaf)
  }

  protected issuePtyHandle(pty: RuntimePtyWorktreeRecord): string {
    return this.terminalSessions.issuePtyHandle(this.runtimeId, pty.ptyId, pty.worktreeId)
  }

  protected resolveExitWaiters(leaf: RuntimeLeafRecord): void {
    const handle = this.issueHandle(leaf)
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'exit') {
        this.resolveWaiter(waiter, buildTerminalWaitResult(handle, 'exit', leaf))
      } else {
        // Why: if the terminal exited, conditions like tui-idle can never be
        // satisfied. Reject immediately instead of letting the poll interval
        // spin until timeout on a dead process.
        this.removeWaiter(waiter)
        waiter.reject(new Error('terminal_exited'))
      }
    }
  }

  protected resolveTuiIdleWaiters(leaf: RuntimeLeafRecord): void {
    const handle = this.terminalSessions.getTerminalHandleForLeafKey(
      this.getLeafKey(leaf.tabId, leaf.leafId)
    )
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'tui-idle') {
        this.resolveWaiter(waiter, buildTerminalWaitResult(handle, 'tui-idle', leaf))
      }
    }
  }

  protected resolvePtyExitWaiters(pty: RuntimePtyWorktreeRecord, ptyId: string): void {
    const handle = this.terminalSessions.getTerminalHandleForPty(ptyId)
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'exit') {
        this.resolveWaiter(waiter, buildPtyTerminalWaitResult(handle, 'exit', pty))
      } else {
        this.removeWaiter(waiter)
        waiter.reject(new Error('terminal_exited'))
      }
    }
  }

  protected resolvePtyTuiIdleWaiters(pty: RuntimePtyWorktreeRecord, ptyId: string): void {
    const handle = this.terminalSessions.getTerminalHandleForPty(ptyId)
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'tui-idle') {
        this.resolveWaiter(waiter, buildPtyTerminalWaitResult(handle, 'tui-idle', pty))
      }
    }
  }

  // Why: OSC title detection via onPtyData is the primary signal for tui-idle,
  // but daemon-hosted terminals don't flow PTY data through the runtime, and
  // some agents don't emit recognized titles on startup. This fallback polls
  // two signals: (1) the renderer-synced tab title (reflects xterm's OSC title
  // handler, works even for daemon terminals), and (2) the PTY foreground process
  // + output quiescence. The poll self-cancels when the primary OSC path fires.
}
