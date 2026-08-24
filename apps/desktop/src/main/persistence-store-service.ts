import { isTerminalLeafId } from '~shared/stable-pane-id'

import { MAX_CLAUDE_LIVE_PTY_SESSION_IDS } from './persisted-state/persisted-terminal-session-codec'
import { layoutContainsLeafId, cloneLayoutNode } from './persistence-layout-tree'
import { StoreLayer10 } from './persistence-store-layer-10'
import { createMinimalPersistedTerminalTab } from './persistence-terminal-migration'

export class Store extends StoreLayer10 {
  // Why: closes the SIGKILL-between-spawn-and-persist race (Issue #217). The
  // renderer's debounced session writer (~450 ms total) is normally the only
  // path that writes tab.ptyId / ptyIdsByLeafId; a force-quit inside that
  // window orphans the daemon's history dir. Patching + sync flushing here
  // before pty:spawn returns guarantees the renderer cannot observe a
  // spawn-success without the binding already being durable on disk.
  persistPtyBinding(args: {
    worktreeId: string
    worktreeInstanceId?: string | null
    tabId: string
    leafId: string
    ptyId: string
    startupCwd?: string
  }): void {
    const session = this.state.workspaceSession
    if (!session) {
      return
    }
    const sessionBeforeBinding = structuredClone(session)
    const tabs = session.tabsByWorktree?.[args.worktreeId]
    const tab = tabs?.find((t) => t.id === args.tabId)
    if (tab) {
      tab.ptyId = args.ptyId
      if (args.worktreeInstanceId !== undefined) {
        if (args.worktreeInstanceId === null) {
          delete tab.worktreeInstanceId
        } else {
          tab.worktreeInstanceId = args.worktreeInstanceId
        }
      }
    } else {
      // Why: pty:spawn can beat the debounced session writer for a newly
      // created tab. Persist a minimal tab so hydration does not prune the
      // crash-safe layout binding below as an orphaned tab id.
      const nextTabs = [
        ...(tabs ?? []),
        createMinimalPersistedTerminalTab({
          ...args,
          existingTabCount: tabs?.length ?? 0
        })
      ]
      session.tabsByWorktree = {
        ...session.tabsByWorktree,
        [args.worktreeId]: nextTabs
      }
      session.activeWorktreeId ??= args.worktreeId
      session.activeTabId ??= args.tabId
      session.activeTabIdByWorktree = {
        ...session.activeTabIdByWorktree,
        [args.worktreeId]: session.activeTabIdByWorktree?.[args.worktreeId] ?? args.tabId
      }
    }
    if (!isTerminalLeafId(args.leafId)) {
      // Why: legacy renderer-local pane ids may arrive from older callers; keep
      // them out of durable leaf-keyed layout state after the UUID migration.
      try {
        this.flushOrThrow()
      } catch (err) {
        this.state.workspaceSession = sessionBeforeBinding
        throw err
      }
      return
    }
    const layout = session.terminalLayoutsByTabId?.[args.tabId]
    if (layout) {
      if (!layout.root) {
        // Why: createTab can persist an empty layout before TerminalPane mounts.
        // The sync spawn binding must still leave a durable UUID root behind.
        layout.root = { type: 'leaf', leafId: args.leafId }
        layout.activeLeafId = args.leafId
        layout.expandedLeafId = null
      } else if (!layoutContainsLeafId(layout.root, args.leafId)) {
        // Why: splitPane publishes the new pane and starts pty:spawn before the
        // debounced full layout snapshot reaches main. Add a minimal leaf so a
        // crash in that window cannot make the new pane's binding unreachable.
        layout.root = {
          type: 'split',
          direction: 'vertical',
          first: cloneLayoutNode(layout.root),
          second: { type: 'leaf', leafId: args.leafId }
        }
        layout.activeLeafId = args.leafId
        if (layout.expandedLeafId && !layoutContainsLeafId(layout.root, layout.expandedLeafId)) {
          layout.expandedLeafId = null
        }
      }
      layout.ptyIdsByLeafId = {
        ...layout.ptyIdsByLeafId,
        [args.leafId]: args.ptyId
      }
    } else {
      // Why: first-spawn-ever for a new tab — the renderer's debounced writer
      // creates the layout entry on PaneManager init, but the binding has to
      // be on disk before pty:spawn returns or a SIGKILL inside the same
      // window would lose ptyIdsByLeafId for split-pane cold restore. The
      // renderer will overwrite this minimal layout once persistLayoutSnapshot
      // fires.
      session.terminalLayoutsByTabId = {
        ...session.terminalLayoutsByTabId,
        [args.tabId]: {
          root: { type: 'leaf', leafId: args.leafId },
          activeLeafId: args.leafId,
          expandedLeafId: null,
          ptyIdsByLeafId: { [args.leafId]: args.ptyId }
        }
      }
    }
    try {
      this.flushOrThrow()
    } catch (err) {
      this.state.workspaceSession = sessionBeforeBinding
      throw err
    }
  }

  // ── Live Claude PTY sessions ───────────────────────────────────────

  getClaudeLivePtySessionIds(): string[] {
    return [...(this.state.claudeLivePtySessionIds ?? [])]
  }

  addClaudeLivePtySessionId(sessionId: string): void {
    if (sessionId.length === 0 || sessionId.length > 512) {
      return
    }
    const ids = this.state.claudeLivePtySessionIds ?? []
    if (ids.includes(sessionId)) {
      return
    }
    // Why: drop the oldest entry at the cap — stale ids are pruned against the
    // daemon at startup anyway, so recency is the only thing worth keeping.
    this.state.claudeLivePtySessionIds = [...ids, sessionId].slice(-MAX_CLAUDE_LIVE_PTY_SESSION_IDS)
    // Why: flush synchronously — a force-quit right after a Claude spawn must
    // still seed the live-PTY gate on the next launch.
    this.flush()
  }

  removeClaudeLivePtySessionId(sessionId: string): void {
    const ids = this.state.claudeLivePtySessionIds ?? []
    if (!ids.includes(sessionId)) {
      return
    }
    this.state.claudeLivePtySessionIds = ids.filter((id) => id !== sessionId)
    this.scheduleSave()
  }

  // ── Flush (for shutdown) ───────────────────────────────────────────

  flush(): void {
    try {
      this.flushOrThrow()
    } catch (err) {
      console.error('[persistence] Failed to flush state:', err)
    }
    this.githubCacheFile.writeIfDirty(this.state.githubCache)
  }

  // Why: called after a project move rewrote this store's data file directly.
  // From that point until relaunch, the in-memory state is stale and any
  // write (debounced, sync, or shutdown flush) would undo the transfer.
  freezeWrites(): void {
    this.durableStateFile.freezeWrites()
  }
}
