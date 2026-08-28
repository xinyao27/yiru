import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import { getDefaultWorkspaceSession } from '@yiru/runtime-protocol/workbench/constants'
import { isTerminalLeafId } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import type {
  PersistedState,
  TerminalPaneLayoutNode,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '@yiru/runtime-protocol/workbench/types'
import { pruneWorkspaceSessionBrowserHistory } from '@yiru/runtime-protocol/workbench/workspace/session-browser-history'
import { pruneLocalTerminalScrollbackBuffers } from '@yiru/runtime-protocol/workbench/workspace/session-terminal-buffers'
import { setMigrationUnsupportedPty } from '~main/agents/hooks/migration-unsupported-pty-state'
import { registerPersistedPaneKeyAlias } from '~main/persistence/compatibility'
import {
  preserveMissingLeafRecordEntries,
  findWorktreeIdForTab
} from '~main/persistence/layout-tree'
import {
  normalizeWorkspaceSessionPaneIdentities,
  remapAcknowledgedAgentPaneKeys
} from '~main/persistence/pane-identity'
import { deleteRemovedTerminalScrollbackSnapshots } from '~main/persistence/terminal-migration'
import {
  migrateWorkspaceSessionTerminalScrollbackSnapshots,
  readTerminalScrollbackSnapshotSync,
  type TerminalScrollbackSnapshotStorage
} from '~main/terminal/scrollback-snapshots'

import { PersistenceSlice, type PersistenceRuntime, type StoreMethodLookup } from '../slice'
import { deriveWorkspaceSessionPatchScope, type WorkspaceSessionPatchScope } from './patch-scope'

export class WorkspaceSessionSlice extends PersistenceSlice {
  private readonly terminalScrollbackSnapshotStorage: TerminalScrollbackSnapshotStorage

  constructor(
    runtime: PersistenceRuntime,
    lookupStoreMethod: StoreMethodLookup,
    terminalScrollbackSnapshotStorage: TerminalScrollbackSnapshotStorage
  ) {
    super(runtime, lookupStoreMethod)
    this.terminalScrollbackSnapshotStorage = terminalScrollbackSnapshotStorage
  }

  protected resolveHostId(hostId?: string | null): ExecutionHostId {
    return normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  }

  getWorkspaceSession(hostId?: string | null): PersistedState['workspaceSession'] {
    const resolved = this.resolveHostId(hostId)
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      return this.state.workspaceSession ?? getDefaultWorkspaceSession()
    }
    return this.state.workspaceSessionsByHostId?.[resolved] ?? getDefaultWorkspaceSession()
  }

  readTerminalScrollbackSnapshot(ref: string): string | null {
    return readTerminalScrollbackSnapshotSync(ref, this.terminalScrollbackSnapshotStorage)
  }

  getWorktreeIdForTab(tabId: string): string | undefined {
    return findWorktreeIdForTab(this.getWorkspaceSession(), tabId)
  }

  setWorkspaceSession(session: PersistedState['workspaceSession'], hostId?: string | null): void {
    const resolved = this.resolveHostId(hostId)
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      this.setLocalWorkspaceSession(session)
      return
    }
    this.setHostWorkspaceSession(resolved, session)
  }

  protected setHostWorkspaceSession(hostId: ExecutionHostId, session: WorkspaceSessionState): void {
    const pruned = pruneWorkspaceSessionBrowserHistory(
      pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    )
    this.state.workspaceSessionsByHostId = {
      ...this.state.workspaceSessionsByHostId,
      [hostId]: pruned
    }
    this.scheduleSave('sessions')
  }

  protected setLocalWorkspaceSession(
    session: PersistedState['workspaceSession'],
    scope?: WorkspaceSessionPatchScope
  ): void {
    session = scope
      ? this.transformScopedLayouts(session, scope.tabIds, (scoped) =>
          pruneLocalTerminalScrollbackBuffers(scoped, this.state.repos)
        )
      : pruneWorkspaceSessionBrowserHistory(
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
    const scopedSession = scope ? this.selectScopedLayouts(session, scope.tabIds) : session
    const scopedPriorLayouts = scope
      ? this.selectScopedLayouts(prior, scope.tabIds).terminalLayoutsByTabId
      : prior?.terminalLayoutsByTabId
    const normalized = normalizeWorkspaceSessionPaneIdentities(scopedSession, scopedPriorLayouts)
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
      this.scheduleSave('ui')
    }
    for (const entry of normalized.legacyPaneKeyAliasEntries) {
      registerPersistedPaneKeyAlias(entry)
    }
    session = scope
      ? this.mergeScopedLayouts(session, normalized.session.terminalLayoutsByTabId)
      : normalized.session
    if (session && prior) {
      const priorTabs = prior.tabsByWorktree ?? {}
      const nextTabs = session.tabsByWorktree ?? {}
      for (const [worktreeId, tabs] of Object.entries(nextTabs)) {
        if (scope && !scope.worktreeIds.has(worktreeId)) {
          continue
        }
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
        if (scope && !scope.tabIds.has(tabId)) {
          continue
        }
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
    session = scope
      ? this.transformScopedLayouts(session, scope.tabIds, (scoped) =>
          pruneLocalTerminalScrollbackBuffers(scoped, this.state.repos)
        )
      : pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    session = scope
      ? this.transformScopedLayouts(
          session,
          scope.tabIds,
          (scoped) =>
            migrateWorkspaceSessionTerminalScrollbackSnapshots(
              scoped,
              this.terminalScrollbackSnapshotStorage
            ).session
        )
      : migrateWorkspaceSessionTerminalScrollbackSnapshots(
          session,
          this.terminalScrollbackSnapshotStorage
        ).session
    deleteRemovedTerminalScrollbackSnapshots(prior, session, this.terminalScrollbackSnapshotStorage)
    this.state.workspaceSession = session
    this.scheduleSave('sessions')
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
    const hasTerminalPatch =
      Object.hasOwn(patch, 'tabsByWorktree') || Object.hasOwn(patch, 'terminalLayoutsByTabId')
    if (hasTerminalPatch && resolved === LOCAL_EXECUTION_HOST_ID) {
      this.setLocalWorkspaceSession(
        next,
        deriveWorkspaceSessionPatchScope(this.state.workspaceSession, patch)
      )
      return
    }
    if (hasTerminalPatch) {
      this.setHostWorkspaceSession(resolved, next)
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
    this.scheduleSave('sessions')
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

  private selectScopedLayouts(
    session: WorkspaceSessionState | undefined,
    tabIds: ReadonlySet<string>
  ): WorkspaceSessionState {
    const base = session ?? getDefaultWorkspaceSession()
    const terminalLayoutsByTabId = Object.fromEntries(
      [...tabIds]
        .map((tabId) => [tabId, base.terminalLayoutsByTabId?.[tabId]] as const)
        .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1]))
    )
    return { ...base, terminalLayoutsByTabId }
  }

  private mergeScopedLayouts(
    session: WorkspaceSessionState,
    scopedLayouts: WorkspaceSessionState['terminalLayoutsByTabId']
  ): WorkspaceSessionState {
    return {
      ...session,
      terminalLayoutsByTabId: { ...session.terminalLayoutsByTabId, ...scopedLayouts }
    }
  }

  private transformScopedLayouts(
    session: WorkspaceSessionState,
    tabIds: ReadonlySet<string>,
    transform: (scoped: WorkspaceSessionState) => WorkspaceSessionState
  ): WorkspaceSessionState {
    return this.mergeScopedLayouts(
      session,
      transform(this.selectScopedLayouts(session, tabIds)).terminalLayoutsByTabId
    )
  }
}
