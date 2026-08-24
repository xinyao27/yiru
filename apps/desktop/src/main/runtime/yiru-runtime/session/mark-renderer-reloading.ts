import { HEADLESS_RUNTIME_WINDOW_ID } from '~shared/runtime-types'

import { RuntimeTerminalStopTerminalsForWorktree } from '../terminal/stop-terminals-for-worktree'

export abstract class RuntimeSessionMarkRendererReloading extends RuntimeTerminalStopTerminalsForWorktree {
  markRendererReloading(windowId: number): void {
    if (!this.terminalSessions.markGraphReloading(windowId)) {
      return
    }
    // Why: any renderer reload tears down the published live graph, so live
    // terminal handles must become stale immediately instead of being reused
    // against whatever the renderer rebuilds next.
    this.setTerminalSideEffectConsumerAvailable(false)
    // Why: handleByPtyId maps ptyId → pre-allocated CLI handle (YIRU_TERMINAL_HANDLE).
    // These must survive renderer reloads so CLI agents can keep controlling the
    // same terminal across graph rebuilds — adoptPreAllocatedHandle re-links
    // them when the new graph arrives.
  }

  markGraphReady(windowId: number): void {
    if (!this.terminalSessions.markGraphReady(windowId)) {
      return
    }
    this.setTerminalSideEffectConsumerAvailable(windowId !== HEADLESS_RUNTIME_WINDOW_ID)
  }

  markGraphUnavailable(windowId: number): void {
    if (!this.terminalSessions.markGraphUnavailable(windowId)) {
      return
    }
    // Why: once the authoritative renderer graph disappears, Yiru must fail
    // closed for live-terminal operations instead of guessing from old state.
    this.setTerminalSideEffectConsumerAvailable(false)
    // Why: same as markRendererReloading — pre-allocated CLI handles must
    // survive graph unavailability so they can be re-adopted on reconnect.
  }

  protected assertGraphReady(): void {
    this.terminalSessions.assertGraphReady()
  }

  protected captureReadyGraphEpoch(): number {
    this.assertGraphReady()
    return this.terminalSessions.getGraphEpoch()
  }

  protected assertStableReadyGraph(expectedGraphEpoch: number): void {
    this.terminalSessions.assertGraphReady(expectedGraphEpoch)
  }
}
