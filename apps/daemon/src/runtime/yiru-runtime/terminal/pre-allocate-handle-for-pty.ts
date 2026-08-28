import { isTerminalLeafId, makePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import { isValidTerminalTabId } from '@yiru/runtime-protocol/workbench/terminal/tab-id'

import { normalizeRuntimeWorktreeInstanceId } from '../model/terminal-normalization'
import { RuntimeSessionResolveMobileSessionHostTabId } from '../session/resolve-mobile-session-host-tab-id'

export abstract class RuntimeTerminalPreAllocateHandleForPty extends RuntimeSessionResolveMobileSessionHostTabId {
  preAllocateHandleForPty(ptyId: string): string {
    return this.terminalSessions.preAllocateHandle(ptyId)
  }

  createPreAllocatedTerminalHandle(): string {
    return this.terminalSessions.createPreAllocatedHandle()
  }

  registerPreAllocatedHandleForPty(ptyId: string, handle: string): void {
    this.terminalSessions.registerPreAllocatedHandle(this.runtimeId, ptyId, handle)
  }

  protected adoptControllerTerminalHandle(ptyId: string, handle: string | undefined): void {
    const trimmed = handle?.trim()
    if (!trimmed || !trimmed.startsWith('term_')) {
      return
    }
    if (!this.terminalSessions.canAdoptControllerHandle(this.runtimeId, ptyId, trimmed)) {
      return
    }
    // Why: after an app/runtime restart, the live PTY child still has its
    // original YIRU_TERMINAL_HANDLE, but the runtime's in-memory map is gone.
    this.registerPreAllocatedHandleForPty(ptyId, trimmed)
  }

  onPtySpawned(ptyId: string): void {
    if (!this.terminalSessions.hasPtyRecord(ptyId)) {
      this.getOrCreatePtyWorktreeRecord(ptyId)
    }
    this.terminalSessions.markPtySpawned(ptyId, this.runtimeId)
  }

  registerPty(
    ptyId: string,
    worktreeId: string,
    connectionId: string | null = null,
    binding?: { tabId: string; leafId: string },
    isWsl?: boolean,
    trustedWorktreeInstanceId?: string | null
  ): void {
    // Why: record the renderer pane identity at spawn time so a stalled graph
    // sync can't hide that a live PTY already backs a pending mobile create.
    const paneKey =
      binding && isValidTerminalTabId(binding.tabId) && isTerminalLeafId(binding.leafId)
        ? makePaneKey(binding.tabId, binding.leafId)
        : null
    const hadRecord = this.terminalSessions.hasPtyRecord(ptyId)
    this.recordPtyWorktree(ptyId, worktreeId, {
      connected: true,
      connectionId,
      ...(isWsl !== undefined ? { isWsl } : {}),
      ...(binding && paneKey ? { tabId: binding.tabId, paneKey } : {})
    })
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    if (pty) {
      if (trustedWorktreeInstanceId !== undefined) {
        pty.worktreeInstanceId = normalizeRuntimeWorktreeInstanceId(trustedWorktreeInstanceId)
      } else if (!hadRecord) {
        // Why: direct runtime spawns may bypass IPC; only a new record may bind current meta.
        pty.worktreeInstanceId = normalizeRuntimeWorktreeInstanceId(
          this.store?.getWorktreeMeta(worktreeId)?.instanceId
        )
      }
      this.terminalSessions.commitPtyState(ptyId, { pty })
    }
    // Why: the renderer's own PTY spawn is the reliable signal that the pending
    // mobile create's tab is live; publish its surface main-side (#7587).
    if (binding && paneKey) {
      this.ensurePtyBackedMobileSurfaceForRendererTab(worktreeId, binding.tabId)
    }
  }

  /** Record the spawn launch command so the per-PTY Command Code detector can
   *  arm from it (renderer startupCommand parity). Best-effort: a chunk that
   *  beats this call falls back to the detector's banner arming. */

  noteTerminalSpawnCommand(ptyId: string, command: string | null | undefined): void {
    const trimmed = typeof command === 'string' ? command.trim() : ''
    if (trimmed.length > 0) {
      this.terminalSpawnCommandsByPtyId.set(ptyId, trimmed)
    }
  }

  /**
   * Handles incoming data from a PTY process, running agent detection,
   * updating terminal tail buffers, and triggering foreground agent refreshes.
   */
}
