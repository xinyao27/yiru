import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'
import type { RuntimeTerminalRead } from '@yiru/runtime-protocol/workbench/runtime-types'
import { TerminalKittyKeyboardModeTracker } from '@yiru/runtime-protocol/workbench/terminal/kitty-keyboard-mode-tracker'
import { HeadlessEmulator } from '~main/daemon/headless-emulator'

import type { ProviderTerminalBufferSnapshot } from '../model/mobile-worktree-summary'
import { buildVisibleSnapshotPreview } from '../model/terminal-read'
import { RuntimeTerminalSeedHeadlessTerminal } from './seed-headless-terminal'

export abstract class RuntimeTerminalClearHeadlessTerminalBuffer extends RuntimeTerminalSeedHeadlessTerminal {
  async clearHeadlessTerminalBuffer(ptyId: string): Promise<void> {
    const state = this.terminalSessions.getEmulator(ptyId)
    if (!state) {
      return
    }
    // Why: headless writes are queued to preserve xterm parser order. Clear
    // must join that same chain or an earlier PTY chunk can finish after the
    // clear request and repopulate mobile scrollback.
    state.writeChain = state.writeChain.then(() => state.emulator.clearScrollback())
    await state.writeChain
  }

  protected async serializeTerminalBufferFromAvailableState(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    pendingEscapeTailAnsi?: string
  } | null> {
    if (this.providerSnapshotPreferredPtys.has(ptyId)) {
      // Why: pre-attach stream bytes only form a suffix of restored state. A
      // sequenced provider snapshot safely reconciles those live bytes.
      const providerSnapshot = await this.serializeProviderTerminalBuffer(ptyId, opts)
      if (providerSnapshot) {
        return providerSnapshot
      }
    }
    const headlessSnapshot = await this.serializeHeadlessTerminalBuffer(ptyId, opts)
    if (headlessSnapshot) {
      return headlessSnapshot
    }

    return this.serializeProviderTerminalBuffer(ptyId, opts)
  }

  protected async serializeProviderTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<ProviderTerminalBufferSnapshot | null> {
    const liveModeTracker = new TerminalKittyKeyboardModeTracker()
    let liveModeTrackers = this.providerModeSnapshotScansByPtyId.get(ptyId)
    if (!liveModeTrackers) {
      liveModeTrackers = new Set()
      this.providerModeSnapshotScansByPtyId.set(ptyId, liveModeTrackers)
    }
    liveModeTrackers.add(liveModeTracker)
    try {
      // Why: daemon PTYs survive an app relaunch before any renderer mounts.
      // Mobile still needs their retained history without navigating desktop.
      const snapshot = await this.ptyController?.serializeProviderBuffer?.(ptyId, opts)
      if (typeof snapshot?.alternateScreen === 'boolean') {
        const modeTracker = new TerminalKittyKeyboardModeTracker()
        if (snapshot.alternateScreen) {
          modeTracker.scan('\x1b[?1049h')
        }
        if (liveModeTracker.hasObservedAlternateScreenSwitch) {
          modeTracker.scan(liveModeTracker.isAlternateScreen ? '\x1b[?1049h' : '\x1b[?1049l')
        }
        this.providerModeTrackersByPtyId.set(ptyId, modeTracker)
      }
      if (!snapshot) {
        return null
      }
      const providerOffset = this.providerSequenceOffsetByPtyId.get(ptyId) ?? 0
      return this.preferTrackedLastTitle(ptyId, {
        ...snapshot,
        seq: providerOffset + snapshot.seq,
        source: 'provider' as const
      })
    } catch {
      return null
    } finally {
      liveModeTrackers.delete(liveModeTracker)
      if (liveModeTrackers.size === 0) {
        this.providerModeSnapshotScansByPtyId.delete(ptyId)
      }
    }
  }

  protected async withVisibleSnapshotPreview(
    ptyId: string,
    read: RuntimeTerminalRead,
    opts: { cursor?: number; limit?: number } = {}
  ): Promise<RuntimeTerminalRead> {
    if (typeof opts.cursor === 'number') {
      return read
    }
    // Why: the retained tail is a transcript approximation and cannot model terminal-width
    // wrapping plus prompt redraws. Human/agent previews use the authoritative emulator frame.
    const lines = await this.readVisibleSnapshotLines(ptyId)
    if (lines.length === 0) {
      return read
    }
    return buildVisibleSnapshotPreview(read, lines, opts.limit)
  }

  protected async readVisibleSnapshotLines(ptyId: string): Promise<string[]> {
    try {
      // Why: a local Bun PTY's provider buffer is the same authoritative frame replayed into
      // xterm. The runtime emulator can lag geometry changes while a desktop viewer is mounted.
      const snapshot =
        (await this.serializeProviderTerminalBuffer(ptyId, { scrollbackRows: 0 })) ??
        (await this.serializeTerminalBufferFromAvailableState(ptyId, { scrollbackRows: 0 }))
      if (!snapshot || snapshot.data.length === 0) {
        return []
      }
      const emulator = new HeadlessEmulator({
        cols: snapshot.cols,
        rows: snapshot.rows,
        scrollback: 0
      })
      try {
        await emulator.write(snapshot.data)
        return emulator
          .getVisibleLines()
          .map((line) => line.trimEnd())
          .filter((line) => line.trim().length > 0)
      } finally {
        emulator.dispose()
      }
    } catch {
      return []
    }
  }
}
