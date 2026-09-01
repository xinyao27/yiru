import type { RuntimeMobileSessionCreateTerminalResult } from '@yiru/runtime-protocol/workbench/runtime-types'
import { parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeTerminalCreateHeadlessMobileSessionTerminal } from './create-headless-mobile-session-terminal'

export abstract class RuntimeTerminalFindMobileTerminalSurface extends RuntimeTerminalCreateHeadlessMobileSessionTerminal {
  protected findMobileTerminalSurface(
    worktreeId: string,
    parentTabId: string,
    options: { requireReady?: boolean } = {}
  ): RuntimeMobileSessionCreateTerminalResult | null {
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return null
    }
    const result = this.toMobileSessionTabsResult(snapshot)
    const tab = result.tabs.find(
      (candidate) => candidate.type === 'terminal' && candidate.parentTabId === parentTabId
    )
    if (!tab || tab.type !== 'terminal') {
      return null
    }
    const surface = {
      tab,
      publicationEpoch: result.publicationEpoch,
      snapshotVersion: result.snapshotVersion
    }
    if (options.requireReady === true && !this.isReadyMobileTerminalSurface(surface)) {
      return null
    }
    return surface
  }

  // Why: for an in-flight mobile create whose surface hasn't published yet,
  // publish it main-side from the live renderer PTY so the create doesn't wait
  // on a stalled graph sync and destroy the session (#7587). No-op unless a
  // matching create is pending and a live bound PTY exists; never double-inserts.

  protected ensurePtyBackedMobileSurfaceForRendererTab(
    worktreeId: string,
    tabId: string
  ): RuntimeMobileSessionCreateTerminalResult | null {
    const pending = this.pendingMobileTerminalCreatesByKey.get(`${worktreeId}::${tabId}`)
    if (!pending) {
      return null
    }
    const existing = this.findMobileTerminalSurface(worktreeId, tabId)
    if (existing && this.isReadyMobileTerminalSurface(existing)) {
      // Why: the renderer's ready publication already landed; only a pending
      // shell still needs the main-side PTY rescue.
      return existing
    }
    const pty = this.findLiveRegisteredPtyForRendererTab(worktreeId, tabId)
    const leafId = pty ? parsePaneKey(pty.paneKey ?? '')?.leafId : undefined
    if (!pty || !leafId) {
      return existing
    }
    this.publishPtyBackedMobileSessionTerminal(worktreeId, pty, {
      tabId,
      leafId,
      title: null,
      activate: pending.activate,
      selectIfNoActiveTab: pending.selectIfNoActiveTab
    })
    // Why: waitForMobileTerminalSurface's check closures are drained only inside
    // syncWindowGraph; a main-side publish must drain them too or the pending
    // wait won't observe the insertion (mirrors syncWindowGraph's drain).
    this.terminalSessions.notifyGraphSynced()
    return this.findMobileTerminalSurface(worktreeId, tabId)
  }

  protected findLiveRegisteredPtyForRendererTab(
    worktreeId: string,
    tabId: string
  ): RuntimePtyWorktreeRecord | null {
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (
        pty.worktreeId === worktreeId &&
        pty.tabId === tabId &&
        pty.connected &&
        parsePaneKey(pty.paneKey ?? '')?.leafId
      ) {
        return pty
      }
    }
    return null
  }

  // Why: rollback guard, looser than findLiveRegisteredPtyForRendererTab — a
  // shell whose pane key hasn't registered yet can't be surface-rescued, but
  // it is still a real terminal the create timeout must not kill (#7718).

  protected hasLiveShellForRendererTab(worktreeId: string, tabId: string): boolean {
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.worktreeId === worktreeId && pty.tabId === tabId && pty.connected) {
        return true
      }
    }
    return false
  }

  protected isReadyMobileTerminalSurface(
    surface: RuntimeMobileSessionCreateTerminalResult | null
  ): boolean {
    return (
      surface?.tab.status === 'ready' &&
      typeof surface.tab.terminal === 'string' &&
      surface.tab.terminal.length > 0
    )
  }

  protected waitForTerminalHandle(tabId: string, timeoutMs = 10_000): Promise<string> {
    const existing = this.resolveHandleForTab(tabId)
    if (existing) {
      return Promise.resolve(existing)
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.terminalSessions.removeGraphSyncCallback(check)
        reject(new Error('Timed out waiting for terminal handle after creation'))
      }, timeoutMs)

      const check = (): void => {
        const handle = this.resolveHandleForTab(tabId)
        if (handle) {
          clearTimeout(timer)
          this.terminalSessions.removeGraphSyncCallback(check)
          resolve(handle)
        }
      }
      this.terminalSessions.addGraphSyncCallback(check)
      // Why: the graph sync may have fired between the initial check and
      // callback registration. Re-check immediately to avoid a missed wake-up.
      check()
    })
  }

  // Why: mobile clients may subscribe before the PTY spawns (the left pane
  // of a new workspace). Instead of bailing with a bare scrollback+end,
  // wait for the PTY to appear so the subscribe can proceed with phone-fit.
}
