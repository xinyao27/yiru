import { isTerminalLeafId } from '@yiru/runtime-protocol/workbench/stable-pane-id'

import { layoutContainsLeafId, cloneLayoutNode } from '../layout-tree'
import { PersistenceSlice } from '../slice'
import { createMinimalPersistedTerminalTab } from '../terminal-migration'

export class PtyBindingSlice extends PersistenceSlice {
  // Why: closes the SIGKILL-between-spawn-and-persist race (Issue #217). The
  // renderer's debounced session writer (~450 ms total) is normally the only
  // path that writes tab.ptyId / ptyIdsByLeafId; a force-quit inside that
  // window orphans the daemon's history dir. Patching here starts an immediate
  // async write of only the session region without stalling PTY spawn.
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
      this.flushRegion('sessions')
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
    this.flushRegion('sessions')
  }
}
