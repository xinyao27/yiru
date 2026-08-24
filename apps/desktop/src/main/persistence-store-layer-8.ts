import type {
  PersistedState,
  WorkspaceLineage,
  WorkspaceKey,
  GlobalSettings,
  WorkspaceSessionState
} from '~shared/types'
import { folderWorkspaceKey, worktreeWorkspaceKey } from '~shared/workspace/scope'

import { applyPersistedSettingsUpdate } from './persisted-state/persisted-settings-mutations'
import { StoreLayer7 } from './persistence-store-layer-7'

export abstract class StoreLayer8 extends StoreLayer7 {
  /**
   * Move every worktreeId-keyed record from `oldWorktreeId` to `newWorktreeId`
   * after the worktree's folder (and thus its `${repoId}::${path}` id) was
   * renamed on disk, so a post-move refresh re-binds the worktree's state under
   * the new id instead of orphaning it. Records the old id on the new meta's
   * `priorWorktreeIds` so the session GC/hydration can still recognize PTY
   * sessions minted under the old (path-derived) id. No-op when the ids match.
   *
   * Renderer counterpart: `buildWorktreeRenameState` in store/slices/worktrees.ts
   * re-keys the renderer's own worktree-scoped maps for the same id change.
   */
  migrateWorktreeIdentity(oldWorktreeId: string, newWorktreeId: string): void {
    if (oldWorktreeId === newWorktreeId) {
      return
    }
    const oldWorkspaceKey = worktreeWorkspaceKey(oldWorktreeId)
    const newWorkspaceKey = worktreeWorkspaceKey(newWorktreeId)
    const moveKey = <T>(
      record: Record<string, T>,
      mapValue: (value: T) => T = (value) => value
    ): boolean => {
      if (!(oldWorktreeId in record)) {
        return false
      }
      record[newWorktreeId] = mapValue(record[oldWorktreeId])
      delete record[oldWorktreeId]
      return true
    }
    const withNewWorktreeId = <T extends { worktreeId: string }>(value: T): T =>
      value.worktreeId === oldWorktreeId ? { ...value, worktreeId: newWorktreeId } : value
    const migrateSession = (session: WorkspaceSessionState | undefined): boolean => {
      if (!session) {
        return false
      }
      let sessionChanged = false
      const moveSessionKey = <T>(
        record: Record<string, T> | undefined,
        mapValue: (value: T) => T = (value) => value
      ): boolean => {
        if (!record) {
          return false
        }
        let moved = false
        const pairs: [string, string][] = [
          [oldWorktreeId, newWorktreeId],
          [oldWorkspaceKey, newWorkspaceKey]
        ]
        for (const [oldKey, newKey] of pairs) {
          if (!(oldKey in record)) {
            continue
          }
          record[newKey] = mapValue(record[oldKey])
          delete record[oldKey]
          moved = true
        }
        return moved
      }

      sessionChanged =
        moveSessionKey(session.tabsByWorktree, (tabs) => tabs.map(withNewWorktreeId)) ||
        sessionChanged
      sessionChanged =
        moveSessionKey(session.openFilesByWorktree, (files) => files.map(withNewWorktreeId)) ||
        sessionChanged
      sessionChanged = moveSessionKey(session.activeFileIdByWorktree) || sessionChanged
      sessionChanged =
        moveSessionKey(session.browserTabsByWorktree, (workspaces) =>
          workspaces.map(withNewWorktreeId)
        ) || sessionChanged
      if (session.browserPagesByWorkspace) {
        let pagesChanged = false
        const nextPagesByWorkspace = { ...session.browserPagesByWorkspace }
        for (const [workspaceId, pages] of Object.entries(nextPagesByWorkspace)) {
          if (!pages.some((page) => page.worktreeId === oldWorktreeId)) {
            continue
          }
          nextPagesByWorkspace[workspaceId] = pages.map(withNewWorktreeId)
          pagesChanged = true
        }
        if (pagesChanged) {
          session.browserPagesByWorkspace = nextPagesByWorkspace
          sessionChanged = true
        }
      }
      sessionChanged = moveSessionKey(session.activeBrowserTabIdByWorktree) || sessionChanged
      sessionChanged = moveSessionKey(session.activeTabTypeByWorktree) || sessionChanged
      sessionChanged = moveSessionKey(session.activeTabIdByWorktree) || sessionChanged
      sessionChanged =
        moveSessionKey(session.unifiedTabs, (tabs) => tabs.map(withNewWorktreeId)) || sessionChanged
      sessionChanged =
        moveSessionKey(session.tabGroups, (groups) => groups.map(withNewWorktreeId)) ||
        sessionChanged
      sessionChanged = moveSessionKey(session.tabGroupLayouts) || sessionChanged
      sessionChanged = moveSessionKey(session.activeGroupIdByWorktree) || sessionChanged
      sessionChanged = moveSessionKey(session.lastVisitedAtByWorktreeId) || sessionChanged
      sessionChanged =
        moveSessionKey(session.defaultTerminalTabsAppliedByWorktreeId) || sessionChanged
      if (session.activeWorktreeIdsOnShutdown?.includes(oldWorktreeId)) {
        session.activeWorktreeIdsOnShutdown = session.activeWorktreeIdsOnShutdown.map((id) =>
          id === oldWorktreeId ? newWorktreeId : id
        )
        sessionChanged = true
      }
      if (session.activeWorktreeId === oldWorktreeId) {
        session.activeWorktreeId = newWorktreeId
        sessionChanged = true
      }
      if (session.activeWorkspaceKey === oldWorkspaceKey) {
        session.activeWorkspaceKey = newWorkspaceKey
        sessionChanged = true
      }
      if (session.sleepingAgentSessionsByPaneKey) {
        let sleepingChanged = false
        const nextSleeping = { ...session.sleepingAgentSessionsByPaneKey }
        for (const [paneKey, record] of Object.entries(nextSleeping)) {
          if (record.worktreeId !== oldWorktreeId) {
            continue
          }
          nextSleeping[paneKey] = { ...record, worktreeId: newWorktreeId }
          sleepingChanged = true
        }
        if (sleepingChanged) {
          session.sleepingAgentSessionsByPaneKey = nextSleeping
          sessionChanged = true
        }
      }
      return sessionChanged
    }

    let changed = moveKey(this.state.worktreeMeta)
    // Record the prior id so a session minted under it isn't reaped as an orphan.
    const newMeta = this.state.worktreeMeta[newWorktreeId]
    if (newMeta) {
      const prior = newMeta.priorWorktreeIds ?? []
      if (!prior.includes(oldWorktreeId)) {
        newMeta.priorWorktreeIds = [...prior, oldWorktreeId]
        changed = true
      }
    }

    changed = moveKey(this.state.worktreeLineageById) || changed
    const movedLineage = this.state.worktreeLineageById[newWorktreeId]
    if (movedLineage && movedLineage.worktreeId === oldWorktreeId) {
      movedLineage.worktreeId = newWorktreeId
    }
    // Why: other worktrees created from this one carry it as parentWorktreeId;
    // the stable parentWorktreeInstanceId is unaffected, but keep the denormalized
    // path-derived id consistent too.
    for (const lineage of Object.values(this.state.worktreeLineageById)) {
      if (lineage.parentWorktreeId === oldWorktreeId) {
        lineage.parentWorktreeId = newWorktreeId
        changed = true
      }
    }

    if (oldWorkspaceKey in this.state.workspaceLineageByChildKey) {
      const lineage = this.state.workspaceLineageByChildKey[oldWorkspaceKey]
      this.state.workspaceLineageByChildKey[newWorkspaceKey] = {
        ...lineage,
        childWorkspaceKey: newWorkspaceKey
      }
      delete this.state.workspaceLineageByChildKey[oldWorkspaceKey]
      changed = true
    }
    for (const [childKey, lineage] of Object.entries(this.state.workspaceLineageByChildKey)) {
      if (lineage.parentWorkspaceKey === oldWorkspaceKey) {
        this.state.workspaceLineageByChildKey[childKey as WorkspaceKey] = {
          ...lineage,
          parentWorkspaceKey: newWorkspaceKey
        }
        changed = true
      }
    }

    changed = migrateSession(this.state.workspaceSession) || changed
    for (const session of Object.values(this.state.workspaceSessionsByHostId ?? {})) {
      changed = migrateSession(session) || changed
    }
    const showDotfiles = this.state.ui?.showDotfilesByWorktree
    if (showDotfiles) {
      changed = moveKey(showDotfiles) || changed
    }

    if (changed) {
      this.scheduleSave()
    }
  }

  getWorkspaceLineage(childWorkspaceKey: WorkspaceKey): WorkspaceLineage | undefined {
    return this.state.workspaceLineageByChildKey[childWorkspaceKey]
  }

  getAllWorkspaceLineage(): Record<WorkspaceKey, WorkspaceLineage> {
    return this.state.workspaceLineageByChildKey
  }

  setWorkspaceLineage(lineage: WorkspaceLineage): WorkspaceLineage {
    this.state.workspaceLineageByChildKey[lineage.childWorkspaceKey] = lineage
    this.scheduleSave()
    return lineage
  }

  removeWorkspaceLineage(childWorkspaceKey: WorkspaceKey): void {
    delete this.state.workspaceLineageByChildKey[childWorkspaceKey]
    this.scheduleSave()
  }

  protected removeWorkspaceLineageForFolderParent(folderWorkspaceId: string): void {
    const parentKey = folderWorkspaceKey(folderWorkspaceId)
    for (const [childKey, lineage] of Object.entries(this.state.workspaceLineageByChildKey)) {
      if (lineage.parentWorkspaceKey === parentKey) {
        delete this.state.workspaceLineageByChildKey[childKey as WorkspaceKey]
      }
    }
  }

  // ── Settings ───────────────────────────────────────────────────────

  getSettings(): GlobalSettings {
    return this.state.settings
  }

  onSettingsChanged(
    listener: (
      updates: Partial<GlobalSettings>,
      settings: GlobalSettings,
      originWebContentsId?: number
    ) => void
  ): () => void {
    return this.notifications.onSettingsChanged(listener)
  }

  // Why: UI view-state (group/sort/filters etc.) is written from both the
  // desktop renderer and mobile (via the ui.set RPC) into one shared store.
  // Without this, a mobile change persisted but the desktop renderer — which
  // hydrates UI state once — never learned of it, breaking bi-directional sync.
  onUIChanged(listener: (ui: PersistedState['ui']) => void): () => void {
    return this.notifications.onUiChanged(listener)
  }

  updateSettings(
    updates: Partial<GlobalSettings>,
    options: { notifyListeners?: boolean; originWebContentsId?: number } = {}
  ): GlobalSettings {
    const mutation = applyPersistedSettingsUpdate(this.state.settings, updates)
    this.state.settings = mutation.settings
    this.scheduleSave()
    this.notifications.publishSettingsMutation(
      mutation,
      options.notifyListeners === true,
      options.originWebContentsId
    )
    return mutation.settings
  }
}
