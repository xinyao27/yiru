import { LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { isTerminalLeafId } from '~shared/stable-pane-id'
import type {
  PersistedState,
  TerminalPaneLayoutNode,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '~shared/types'
import { pruneWorkspaceSessionBrowserHistory } from '~shared/workspace/session-browser-history'
import { pruneLocalTerminalScrollbackBuffers } from '~shared/workspace/session-terminal-buffers'

import { setMigrationUnsupportedPty } from './agent-hooks/migration-unsupported-pty-state'
import { registerPersistedPaneKeyAlias } from './persistence-compatibility'
import { preserveMissingLeafRecordEntries } from './persistence-layout-tree'
import {
  normalizeWorkspaceSessionPaneIdentities,
  remapAcknowledgedAgentPaneKeys
} from './persistence-pane-identity'
import { StoreLayer9 } from './persistence-store-layer-9'
import { deleteRemovedTerminalScrollbackSnapshots } from './persistence-terminal-migration'
import { migrateWorkspaceSessionTerminalScrollbackSnapshots } from './terminal-scrollback-snapshots'
import { workspaceSessionPatchNeedsFullNormalization } from './workspace-session-patch-normalization'

export abstract class StoreLayer10 extends StoreLayer9 {
  protected setLocalWorkspaceSession(session: PersistedState['workspaceSession']): void {
    session = pruneWorkspaceSessionBrowserHistory(
      pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    )

    // Why: closes the second half of the SIGKILL race (Issue #217). The
    // renderer's debounced session writer captures its state BEFORE pty:spawn
    // returns, so the snapshot it later flushes via session:set has no
    // tab.ptyId / ptyIdsByLeafId for the just-spawned PTY. If that stale
    // snapshot lands AFTER persistPtyBinding's sync flush, it would overwrite
    // the durable binding and re-open the orphan window. Merge in any
    // existing bindings whenever the incoming snapshot's binding is empty.
    const prior = this.state.workspaceSession
    const normalized = normalizeWorkspaceSessionPaneIdentities(
      session,
      prior?.terminalLayoutsByTabId
    )
    for (const entry of normalized.migrationUnsupportedEntries) {
      setMigrationUnsupportedPty(entry)
    }
    const remappedAcknowledgements = remapAcknowledgedAgentPaneKeys(
      this.state.ui?.acknowledgedAgentsByPaneKey,
      normalized.leafIdByInputLeafIdByTabId
    )
    if (remappedAcknowledgements.changed) {
      this.state.ui = {
        ...this.state.ui,
        acknowledgedAgentsByPaneKey: remappedAcknowledgements.acknowledgements
      }
    }
    for (const entry of normalized.legacyPaneKeyAliasEntries) {
      registerPersistedPaneKeyAlias(entry)
    }
    session = normalized.session
    if (session && prior) {
      const priorTabs = prior.tabsByWorktree ?? {}
      const nextTabs = session.tabsByWorktree ?? {}
      for (const [worktreeId, tabs] of Object.entries(nextTabs)) {
        const priorList = priorTabs[worktreeId]
        if (!priorList) {
          continue
        }
        for (const tab of tabs) {
          const priorTab = priorList.find((t) => t.id === tab.id)
          if (!tab.ptyId && priorTab?.ptyId) {
            tab.ptyId = priorTab.ptyId
          }
          if (
            !tab.worktreeInstanceId &&
            priorTab?.worktreeInstanceId &&
            priorTab.ptyId &&
            tab.ptyId === priorTab.ptyId
          ) {
            // Why: a stale renderer snapshot must not erase the spawn-time safety binding.
            tab.worktreeInstanceId = priorTab.worktreeInstanceId
          }
        }
      }
      const priorLayouts = prior.terminalLayoutsByTabId ?? {}
      const nextLayouts = session.terminalLayoutsByTabId ?? {}
      for (const [tabId, layout] of Object.entries(nextLayouts)) {
        const priorLayout = priorLayouts[tabId]
        if (!priorLayout?.ptyIdsByLeafId) {
          continue
        }
        const incoming = layout.ptyIdsByLeafId ?? {}
        const incomingHasAnyBinding = Object.keys(incoming).length > 0
        const liveLeafIds = this.getTerminalLayoutLeafIds(layout.root)
        const restorableBindings = Object.fromEntries(
          Object.entries(priorLayout.ptyIdsByLeafId).filter(
            ([leafId]) =>
              liveLeafIds.has(leafId) &&
              incoming[leafId] === undefined &&
              // Why: an empty layout map can be a stale pre-spawn snapshot; a
              // partial map is intentional.
              !incomingHasAnyBinding
          )
        )
        if (Object.keys(restorableBindings).length > 0) {
          layout.ptyIdsByLeafId = { ...restorableBindings, ...incoming }
          // Why: the same stale session write that drops ptyIdsByLeafId can
          // also be from an older renderer that lacks UUID-keyed metadata.
          const buffersByLeafId = preserveMissingLeafRecordEntries(
            priorLayout.buffersByLeafId,
            layout.buffersByLeafId,
            liveLeafIds
          )
          const scrollbackRefsByLeafId = preserveMissingLeafRecordEntries(
            priorLayout.scrollbackRefsByLeafId,
            layout.scrollbackRefsByLeafId,
            liveLeafIds
          )
          const titlesByLeafId = preserveMissingLeafRecordEntries(
            priorLayout.titlesByLeafId,
            layout.titlesByLeafId,
            liveLeafIds
          )
          if (buffersByLeafId) {
            layout.buffersByLeafId = buffersByLeafId
          }
          if (scrollbackRefsByLeafId) {
            layout.scrollbackRefsByLeafId = scrollbackRefsByLeafId
          }
          if (titlesByLeafId) {
            layout.titlesByLeafId = titlesByLeafId
          }
        }
      }
    }
    session = pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    const migratedScrollback = migrateWorkspaceSessionTerminalScrollbackSnapshots(
      session,
      this.terminalScrollbackSnapshotStorage
    )
    session = migratedScrollback.session
    deleteRemovedTerminalScrollbackSnapshots(prior, session, this.terminalScrollbackSnapshotStorage)
    this.state.workspaceSession = session
    this.scheduleSave()
  }

  patchWorkspaceSession(patch: WorkspaceSessionPatch, hostId?: string | null): void {
    const resolved = this.resolveHostId(hostId)
    // Why: the renderer's debounced hot path sends only changed top-level
    // session slices. Scalar/UI patches avoid the terminal normalization path;
    // terminal topology/layout patches still reuse the stale-PTY protections.
    let next: WorkspaceSessionState = {
      ...this.getWorkspaceSession(resolved),
      ...patch
    }
    if (workspaceSessionPatchNeedsFullNormalization(patch)) {
      this.setWorkspaceSession(next, resolved)
      return
    }
    if (Object.hasOwn(patch, 'browserUrlHistory')) {
      next = pruneWorkspaceSessionBrowserHistory(next)
    }
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      this.state.workspaceSession = next
    } else {
      this.state.workspaceSessionsByHostId = {
        ...this.state.workspaceSessionsByHostId,
        [resolved]: next
      }
    }
    this.scheduleSave()
  }

  protected getTerminalLayoutLeafIds(root: TerminalPaneLayoutNode | null): Set<string> {
    const leafIds = new Set<string>()
    const visit = (node: TerminalPaneLayoutNode | null): void => {
      if (!node) {
        return
      }
      if (node.type === 'leaf') {
        if (isTerminalLeafId(node.leafId)) {
          leafIds.add(node.leafId)
        }
        return
      }
      visit(node.first)
      visit(node.second)
    }
    visit(root)
    return leafIds
  }
}
