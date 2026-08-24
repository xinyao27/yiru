import { HeadlessEmulator } from '~main/daemon/headless-emulator'
import {
  isNativeWindowsConptyPty,
  resolveTerminalQueryReplyOwner,
  type TerminalQueryReplyOwner
} from '~main/runtime/terminal-model-query-authority'
import {
  getTerminalViewAttributes,
  setTerminalViewAttributes
} from '~main/runtime/terminal-view-attribute-store'
import type { TerminalViewAttributes } from '~shared/terminal/view-attributes'

import type { HeadlessSeedMetadata, RuntimeHeadlessTerminal } from '../model/terminal-observation'
import { RuntimeTerminalNotifyFitOverrideListeners } from './notify-fit-override-listeners'

export abstract class RuntimeTerminalSeedHeadlessTerminal extends RuntimeTerminalNotifyFitOverrideListeners {
  seedHeadlessTerminal(
    ptyId: string,
    data: string,
    size?: { cols: number; rows: number },
    metadata: HeadlessSeedMetadata = {}
  ): void {
    if (!data) {
      return
    }
    const existing = this.terminalSessions.getEmulator(ptyId)
    if (existing) {
      // Why: emulator already has live data — re-seeding would duplicate
      // every byte. The seed is only valid when the emulator is fresh.
      if (metadata.preferProviderIfExisting) {
        this.providerSnapshotPreferredPtys.add(ptyId)
      }
      return
    }
    const dims = size ?? this.getTerminalSize(ptyId) ?? { cols: 80, rows: 24 }
    const state = this.createPtyHeadlessTerminalState(ptyId, dims)
    state.outputSequence = this.getPtyOutputSequence(ptyId)
    this.terminalSessions.setEmulator(ptyId, state)
    this.recordOsc7MetadataForPty(ptyId, data)
    this.recordRecentPtyOutputForPathProvenance(ptyId, data)
    state.writeChain = state.writeChain
      .then(async () => {
        // Why: seed writes never set forwardQueryReplies — the main-side
        // replay guard. A snapshot containing old queries must answer no one.
        await state.emulator.write(data)
        // Why AFTER the seed write: the snapshot payload cannot carry kitty
        // pushes (rehydrateSequences deliberately omits them), but ordering
        // behind it keeps the parse deterministic. Unflagged like the seed —
        // re-applying flags must answer no one.
        if (typeof metadata.kittyKeyboardFlags === 'number') {
          await state.emulator.applyKittyKeyboardFlags(metadata.kittyKeyboardFlags)
        }
        if (metadata.cwd !== undefined) {
          state.emulator.setCwd(metadata.cwd)
        }
        if (metadata.oscLinks !== undefined) {
          state.emulator.setRestoredOscLinks(metadata.oscLinks)
        }
        this.providerSnapshotPreferredPtys.delete(ptyId)
      })
      .catch(() => {
        // Seeding is best-effort; live data will continue to populate the
        // emulator even if the snapshot replay fails.
      })
  }

  /** Per-chunk reply ownership is captured synchronously before ingestion so
   *  provider adapters and the queued emulator write use the same decision. */

  getTerminalQueryReplyOwnerForLiveChunk(ptyId: string): TerminalQueryReplyOwner {
    const streams = this.terminalMultiplexPressureByPty.get(ptyId)
    const hasActiveViewer = Array.from(streams?.values() ?? []).some(
      (stream) => stream.participates
    )
    return resolveTerminalQueryReplyOwner(hasActiveViewer)
  }

  updateTerminalViewAttributes(attributes: TerminalViewAttributes): void {
    setTerminalViewAttributes(attributes)
  }

  protected trackHeadlessTerminalData(
    ptyId: string,
    data: string,
    outputSequence: number,
    wireByteSequence: bigint,
    forwardQueryReplies = false
  ): void {
    const state = this.getOrCreateHeadlessTerminal(ptyId)
    state.writeChain = state.writeChain
      .then(async () => {
        // Why: the ingestion-time ownership decision is closed over this
        // chain link; async scheduling cannot retroactively change it.
        await state.emulator.write(data, { forwardQueryReplies })
        state.outputSequence = outputSequence
        state.wireByteSequence = wireByteSequence
      })
      .catch(() => {
        // Best-effort state tracking; live streaming must continue even if
        // xterm rejects a malformed or raced write during shutdown.
      })
  }

  /** Shared factory for the per-PTY runtime emulators (seed, hydration, and
   *  lazy live-byte creation): wires the Phase-5 query-reply sink and the
   *  ConPTY DA1 override. The daemon emulator never goes through here. */

  protected createPtyHeadlessTerminalState(
    ptyId: string,
    dims: { cols: number; rows: number }
  ): RuntimeHeadlessTerminal {
    let state: RuntimeHeadlessTerminal | null = null
    const pathFlavor = this.pathFlavorForPty(this.terminalSessions.getPtyRecord(ptyId))
    const emulator = new HeadlessEmulator({
      cols: dims.cols,
      rows: dims.rows,
      pathFlavor,
      remotePosixFileUriAuthority:
        !!this.terminalSessions.getPtyRecord(ptyId)?.connectionId && pathFlavor !== 'win32',
      // Why: replies take the provider input path (same entry as pty:write —
      // daemon shell-ready gating and the SSH relay write apply unchanged),
      // NOT writePtyInput, so renderer interactive-output metering never
      // counts responder traffic as user-input echo.
      onQueryReply: (reply) => {
        // Why the identity check: queued writeChain links can parse after
        // disposeHeadlessTerminal, and daemon respawns reuse session ids — a
        // stale link's reply must never reach a successor PTY under this id.
        if (state !== null && this.terminalSessions.getEmulator(ptyId) === state) {
          // Why this write is safe pre-shell-ready: daemon Session.write
          // QUEUES (never drops) input while the POSIX shell-ready gate is
          // pending and flushes at the ready marker or the 15s
          // SHELL_READY_TIMEOUT_MS bound (session.ts) — a spawn-time query
          // reply is delayed at most that bound, not lost.
          this.ptyController?.write(ptyId, reply)
        }
      }
    })
    if (isNativeWindowsConptyPty(ptyId)) {
      emulator.installConptyPrimaryDeviceAttributesOverride()
    }
    // Why the lazy getter: replies must use the freshest renderer push at
    // parse time, and stay silent (never default) before the first push.
    emulator.installViewAttributeResponder(() => getTerminalViewAttributes())
    const viewAttributes = getTerminalViewAttributes()
    if (viewAttributes) {
      emulator.applyPushedViewAttributes(viewAttributes)
    }
    state = {
      emulator,
      outputSequence: 0,
      wireByteSequence: this.getTerminalWireByteSequence(ptyId),
      writeChain: Promise.resolve()
    }
    return state
  }

  /** Phase-5 ConPTY DA1 retrofit (terminal-query-authority.md): invoked via
   *  markNativeWindowsConptyPty when the spawn mark lands after daemon stream
   *  data already created this PTY's emulator. Idempotent emulator-side. */

  protected ensureNativeWindowsConptyDa1Override(ptyId: string): void {
    if (isNativeWindowsConptyPty(ptyId)) {
      this.terminalSessions
        .getEmulator(ptyId)
        ?.emulator.installConptyPrimaryDeviceAttributesOverride()
    }
  }

  protected getOrCreateHeadlessTerminal(ptyId: string): RuntimeHeadlessTerminal {
    const existing = this.terminalSessions.getEmulator(ptyId)
    if (existing) {
      return existing
    }
    const size = this.getTerminalSize(ptyId) ?? { cols: 80, rows: 24 }
    const state = this.createPtyHeadlessTerminalState(ptyId, size)
    this.terminalSessions.setEmulator(ptyId, state)
    return state
  }

  protected resizeHeadlessTerminal(ptyId: string, cols: number, rows: number): void {
    const state = this.terminalSessions.getEmulator(ptyId)
    if (!state) {
      return
    }
    // Why: terminal reflow is a parser operation. It must sit in the same
    // per-PTY stream as output bytes or restore snapshots can bake in wraps
    // from the wrong terminal width.
    state.writeChain = state.writeChain
      .then(() => {
        state.emulator.resize(cols, rows)
      })
      .catch(() => {
        // Best-effort mirror tracking; live PTY streaming must continue even
        // if xterm rejects a raced resize during teardown.
      })
  }

  // Public: desktop-initiated clears (ipc/pty.ts) must also drop this mobile
  // mirror or a resubscribing mobile client resurrects the cleared scrollback.
}
