import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'

import { RuntimeTerminalSubscribeToTerminalSideEffects } from './subscribe-to-terminal-side-effects'

export abstract class RuntimeTerminalNotifyFitOverrideListeners extends RuntimeTerminalSubscribeToTerminalSideEffects {
  protected notifyFitOverrideListeners(
    ptyId: string,
    mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit',
    cols: number,
    rows: number
  ): void {
    this.terminalSessions.emitFit(ptyId, { mode, cols, rows })
  }

  serializeTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    seq?: number
    cwd?: string | null
    lastTitle?: string
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    pendingEscapeTailAnsi?: string
  } | null> {
    return this.serializeTerminalBufferFromAvailableState(ptyId, opts)
  }

  hasHeadlessTerminalState(ptyId: string): boolean {
    return this.terminalSessions.hasEmulator(ptyId)
  }

  serializeMainTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    seq?: number
    cwd?: string | null
    lastTitle?: string
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
  } | null> {
    return this.serializeHeadlessTerminalBuffer(ptyId, { ...opts, includeEmpty: true })
  }

  async serializeTerminalMultiplexBuffer(
    ptyId: string,
    scrollbackRows: number
  ): Promise<{
    data: string
    scrollbackAnsi?: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    pendingEscapeTailAnsi?: string
    wireByteSeq: bigint
    retainedScrollbackRows: number
    kittyKeyboardFlags: number
  } | null> {
    const snapshot = await this.serializeHiddenOutputRecoveryBuffer(ptyId, {
      scrollbackRows
    })
    return snapshot
      ? {
          ...snapshot,
          wireByteSeq: snapshot.wireByteSeq ?? this.getTerminalWireByteSequence(ptyId),
          retainedScrollbackRows: snapshot.retainedScrollbackRows ?? 0,
          kittyKeyboardFlags: snapshot.kittyKeyboardFlags ?? 0
        }
      : null
  }

  async serializeHiddenOutputRecoveryBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    wireByteSeq?: bigint
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    pendingEscapeTailAnsi?: string
    retainedScrollbackRows?: number
    kittyKeyboardFlags?: number
  } | null> {
    const headlessSnapshot = await this.serializeHeadlessTerminalBuffer(ptyId, {
      ...opts,
      includeEmpty: true
    })
    if (headlessSnapshot) {
      return headlessSnapshot
    }
    return this.serializeProviderTerminalBuffer(ptyId, opts)
  }

  async clearTerminalBuffer(handle: string): Promise<{ handle: string; cleared: boolean }> {
    const leaf = this.resolveLeafForHandle(handle)
    if (!leaf?.ptyId) {
      throw new Error('terminal_not_found')
    }
    // Why: clear is a terminal UI action (Cmd+K on desktop), not shell input.
    // Route through the controller so renderer-owned xterm buffers, daemon
    // sessions, and SSH relay sessions all drop scrollback before the next
    // mobile snapshot.
    await this.ptyController?.clearBuffer?.(leaf.ptyId)
    await this.clearHeadlessTerminalBuffer(leaf.ptyId)
    return { handle, cleared: true }
  }

  getTerminalSize(ptyId: string): { cols: number; rows: number } | null {
    return this.ptyController?.getSize?.(ptyId) ?? null
  }

  // Why: a width reflow on a normal-buffer PTY must re-stream the full
  // scrollback to mobile so it rewraps at the new cols, but alternate-screen
  // TUIs (vim, Claude Code) own their repaint and have no scrollback — for
  // those the mobile client just resizes xterm geometry and consumes the
  // TUI's own redraw, so the resize re-stream must be skipped. Provider state
  // covers restored PTYs whose main-side emulator is only a partial suffix.

  isTerminalAlternateScreen(ptyId: string): boolean {
    if (this.providerSnapshotPreferredPtys.has(ptyId)) {
      return this.providerModeTrackersByPtyId.get(ptyId)?.isAlternateScreen ?? false
    }
    return (
      this.terminalSessions.getEmulator(ptyId)?.emulator.isAlternateScreen ??
      this.providerModeTrackersByPtyId.get(ptyId)?.isAlternateScreen ??
      false
    )
  }

  // Why: daemon-backed PTYs that the runtime adopted after a Yiru relaunch
  // start with a fresh headless emulator that has zero scrollback, even though
  // the daemon's on-disk checkpoint and the desktop xterm both contain the
  // full prior history. Without this hydration, mobile subscribers see only
  // the bare current prompt because serializeHeadlessTerminalBuffer always
  // wins over the renderer-path fallback. Seeding the emulator with the
  // adapter's snapshot/cold-restore data makes mobile and desktop agree on
  // what scrollback is available.
}
