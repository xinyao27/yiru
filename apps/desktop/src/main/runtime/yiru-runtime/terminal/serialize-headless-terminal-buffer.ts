import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'
import { parseRuntimeTerminalPtyId } from '~shared/runtime-terminal-pty-id'

import {
  appendRecentPtyOutput,
  appendRecentPtyPathCandidates
} from '../model/terminal-path-provenance'
import { RuntimeTerminalClearHeadlessTerminalBuffer } from './clear-headless-terminal-buffer'

export abstract class RuntimeTerminalSerializeHeadlessTerminalBuffer extends RuntimeTerminalClearHeadlessTerminalBuffer {
  protected async serializeHeadlessTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number; includeEmpty?: boolean } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    wireByteSeq?: bigint
    source?: 'headless'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    retainedScrollbackRows?: number
    kittyKeyboardFlags?: number
    // Why: dangling mid-escape tail the restorer must write LAST, after any
    // reset, so the next live chunk completes it instead of rendering it
    // literally (Bug E / #7329).
    pendingEscapeTailAnsi?: string
  } | null> {
    const state = this.terminalSessions.getEmulator(ptyId)
    if (!state) {
      return null
    }
    await state.writeChain
    // Why: normal history is separated from an active alternate frame, so the
    // caller's scrollback policy can be honored without painting it into alt.
    const isAlternateScreen = state.emulator.isAlternateScreen
    const scrollbackRows = opts.scrollbackRows ?? 0
    const snapshot = state.emulator.getSnapshot({ scrollbackRows })
    const data = snapshot.rehydrateSequences + snapshot.snapshotAnsi
    return data.length > 0 || opts.includeEmpty === true
      ? this.preferTrackedLastTitle(ptyId, {
          data,
          cols: snapshot.cols,
          rows: snapshot.rows,
          cwd: snapshot.cwd ?? this.terminalCwdByPtyId.get(ptyId),
          lastTitle: snapshot.lastTitle,
          seq: state.outputSequence,
          wireByteSeq: state.wireByteSequence,
          source: 'headless' as const,
          oscLinks: snapshot.oscLinks,
          retainedScrollbackRows: Math.min(scrollbackRows, snapshot.scrollbackLines),
          kittyKeyboardFlags: snapshot.modes.kittyKeyboardFlags ?? 0,
          scrollbackAnsi: snapshot.scrollbackAnsi,
          ...(snapshot.pendingEscapeTailAnsi
            ? { pendingEscapeTailAnsi: snapshot.pendingEscapeTailAnsi }
            : {}),
          // Why: lets the renderer skip the destructive scrollback clear when
          // restoring an alt-screen snapshot — clearing wipes xterm's own
          // history that the TUI relies on for scroll-up after a tab return.
          alternateScreen: isAlternateScreen,
          // Why NOT folded into data: the renderer writes its post-replay
          // reset after data, and any ESC after a dangling partial aborts it.
          // The restorer writes this last (Bug E fix).
          pendingEscapeTailAnsi: snapshot.pendingEscapeTailAnsi
        })
      : null
  }

  protected disposeHeadlessTerminal(ptyId: string): void {
    const state = this.terminalSessions.takeEmulator(ptyId)
    if (!state) {
      return
    }
    // Why: queued chain links still parse below before the emulator disposes;
    // sever the reply sink now so they cannot write to a respawned PTY that
    // reused this id (belt to the sink's state-identity check).
    state.emulator.disableQueryReplyForwarding()
    state.writeChain.finally(() => state.emulator.dispose()).catch(() => state.emulator.dispose())
  }

  protected resolveLocalRuntimeTerminalPtyId(ptyId: string): string {
    let resolvedPtyId = ptyId
    const visitedPtyIds = new Set([ptyId])
    while (true) {
      const runtimeTerminal = parseRuntimeTerminalPtyId(resolvedPtyId)
      if (!runtimeTerminal || runtimeTerminal.environmentId !== null) {
        return resolvedPtyId
      }
      const nextPtyId = this.terminalSessions.getTerminalHandle(runtimeTerminal.handle)?.ptyId
      if (!nextPtyId || visitedPtyIds.has(nextPtyId)) {
        return resolvedPtyId
      }
      visitedPtyIds.add(nextPtyId)
      resolvedPtyId = nextPtyId
    }
  }

  resolveLeafForHandle(handle: string): { ptyId: string | null } | null {
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record) {
      return null
    }
    if (record.tabId.startsWith('pty:')) {
      return {
        ptyId: record.ptyId ? this.resolveLocalRuntimeTerminalPtyId(record.ptyId) : null
      }
    }
    const leaf = this.terminalSessions.getGraphLeafByKey(
      this.getLeafKey(record.tabId, record.leafId)
    )
    if (!leaf) {
      return null
    }
    return {
      ptyId: leaf.ptyId ? this.resolveLocalRuntimeTerminalPtyId(leaf.ptyId) : null
    }
  }

  // Why: remote clients hold handles across transport reconnects. A handle
  // minted for a concrete PTY must never silently adopt a different PTY that
  // later occupies the same pane — that misroutes keystrokes (#7718). Handles
  // still awaiting their first PTY (ptyId null) may adopt it, which preserves
  // the mobile pre-spawn subscribe flow.

  resolveLiveLeafForHandle(handle: string): { ptyId: string | null } | null {
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record) {
      return null
    }
    if (record.tabId.startsWith('pty:')) {
      return {
        ptyId: record.ptyId ? this.resolveLocalRuntimeTerminalPtyId(record.ptyId) : null
      }
    }
    const leaf = this.terminalSessions.getGraphLeafByKey(
      this.getLeafKey(record.tabId, record.leafId)
    )
    if (!leaf) {
      return null
    }
    if (
      record.ptyId !== null &&
      (leaf.ptyId !== record.ptyId || leaf.ptyGeneration !== record.ptyGeneration)
    ) {
      throw new Error('terminal_handle_stale')
    }
    return {
      ptyId: leaf.ptyId ? this.resolveLocalRuntimeTerminalPtyId(leaf.ptyId) : null
    }
  }

  async resolveTerminalCwd(handle: string): Promise<string | null> {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    if (!ptyId) {
      return null
    }
    const tracked = this.terminalCwdByPtyId.get(ptyId)
    if (tracked) {
      return tracked
    }
    try {
      const cwd = await this.ptyController?.getCwd?.(ptyId)
      return cwd && cwd.trim().length > 0 ? cwd : null
    } catch {
      return null
    }
  }

  resolveTerminalFileUriHostname(handle: string): string | null {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    return ptyId ? (this.terminalFileUriHostnameByPtyId.get(ptyId) ?? null) : null
  }

  protected recordRecentPtyOutputForPathProvenance(ptyId: string, data: string): void {
    this.recentPtyOutputById.set(
      ptyId,
      appendRecentPtyOutput(this.recentPtyOutputById.get(ptyId), data)
    )
    this.recentPtyPathCandidatesById.set(
      ptyId,
      appendRecentPtyPathCandidates(this.recentPtyPathCandidatesById.get(ptyId), data)
    )
  }

  resolveTerminalContext(
    handle: string
  ): { worktreeId: string; connectionId: string | null } | null {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    const pty = ptyId ? this.terminalSessions.getPtyRecord(ptyId) : null
    return pty ? { worktreeId: pty.worktreeId, connectionId: pty.connectionId } : null
  }

  // Why: remote clients cannot resolve this runtime's WSL project preference,
  // so host-affecting RPCs resolve it from the owning store.
}
