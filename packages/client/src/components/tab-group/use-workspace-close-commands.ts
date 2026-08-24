import { useCallback } from 'react'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { browserWorkspaceHasRemoteOwner } from '~renderer/runtime/remote-browser-tab-ownership'
import {
  closeWebRuntimeSessionTab,
  isWebRuntimeSessionActive
} from '~renderer/runtime/web-runtime-session'
import { useAppStore } from '~renderer/store'
import { destroyWorkspaceWebviews } from '~renderer/store/slices/browser-webview-cleanup'
import type { Tab, TabGroup } from '~shared/types'

import { requestEditorFileClose } from '../editor/autosave'
import { closeTerminalTab } from '../terminal/tab-actions'

export function useWorkspaceCloseCommands({
  group,
  groupId,
  groupTabs,
  worktreeId
}: {
  group: TabGroup | null
  groupId: string
  groupTabs: readonly Tab[]
  worktreeId: string
}) {
  const closeUnifiedTab = useAppStore((state) => state.closeUnifiedTab)
  const closeEmptyGroup = useAppStore((state) => state.closeEmptyGroup)
  const closeTab = useAppStore((state) => state.closeTab)
  const closeFile = useAppStore((state) => state.closeFile)
  const closeBrowserTab = useAppStore((state) => state.closeBrowserTab)
  const setActiveWorktree = useAppStore((state) => state.setActiveWorktree)

  const closeEditorIfUnreferenced = useCallback(
    (entityId: string, closingTabId: string) => {
      const state = useAppStore.getState()
      const otherReference = (state.unifiedTabsByWorktree[worktreeId] ?? []).some(
        (item) =>
          item.id !== closingTabId &&
          item.entityId === entityId &&
          (item.contentType === 'editor' ||
            item.contentType === 'diff' ||
            item.contentType === 'conflict-review' ||
            item.contentType === 'check-details')
      )
      if (otherReference) {
        return true
      }
      const file = state.openFiles.find((candidate) => candidate.id === entityId)
      if (file?.isDirty) {
        // Why: split-group close must use the shared unsaved-file queue so tab
        // close, bulk close, and window quit keep identical ordering.
        requestEditorFileClose(entityId)
        return false
      }
      closeFile(entityId)
      return true
    },
    [closeFile, worktreeId]
  )
  const leaveWorktreeIfEmpty = useCallback(() => {
    const state = useAppStore.getState()
    if (state.activeWorktreeId !== worktreeId) {
      return
    }
    // Why: the split-group path bypasses the legacy workspace handlers that
    // deselect the worktree after its final visible surface closes.
    if (state.reconcileWorktreeTabModel(worktreeId).renderableTabCount === 0) {
      setActiveWorktree(null)
    }
  }, [setActiveWorktree, worktreeId])
  const closeBrowser = useCallback(
    (item: Tab) => {
      const state = useAppStore.getState()
      const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
      const hasLocalPages = (state.browserPagesByWorkspace[item.entityId] ?? []).length > 0
      // Why: a pageless host mirror has no remote-owned page record, but still
      // needs the host close. A genuine client-local browser always has pages.
      const shouldCloseOnHost =
        isWebRuntimeSessionActive(environmentId) &&
        (browserWorkspaceHasRemoteOwner(state, item.entityId, environmentId) || !hasLocalPages)
      if (shouldCloseOnHost) {
        void closeWebRuntimeSessionTab({
          worktreeId,
          tabId: item.id,
          environmentId
        })
      }
      destroyWorkspaceWebviews(state.browserPagesByWorkspace, item.entityId)
      closeBrowserTab(item.entityId)
      closeUnifiedTab(item.id)
    },
    [closeBrowserTab, closeUnifiedTab, worktreeId]
  )
  const closeItem = useCallback(
    (itemId: string, options?: { skipEmptyCheck?: boolean }) => {
      const item = groupTabs.find((candidate) => candidate.id === itemId)
      if (!item || item.isPinned) {
        return
      }
      if (item.contentType === 'terminal') {
        closeTerminalTab(item.entityId)
      } else if (item.contentType === 'browser') {
        closeBrowser(item)
      } else if (item.contentType === 'simulator' || item.contentType === 'git-graph') {
        closeUnifiedTab(item.id)
      } else if (closeEditorIfUnreferenced(item.entityId, item.id)) {
        closeUnifiedTab(item.id)
      } else {
        return
      }
      if (!options?.skipEmptyCheck) {
        leaveWorktreeIfEmpty()
      }
    },
    [closeBrowser, closeEditorIfUnreferenced, closeUnifiedTab, groupTabs, leaveWorktreeIfEmpty]
  )
  const closeMany = useCallback(
    (itemIds: string[]) => {
      for (const itemId of itemIds) {
        const item = groupTabs.find((candidate) => candidate.id === itemId)
        if (!item || item.isPinned) {
          continue
        }
        const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
        if (item.contentType === 'terminal' && isWebRuntimeSessionActive(environmentId)) {
          // Why: paired-host bulk close revokes local resume and hook authority
          // before the host removes its canonical tab.
          closeTerminalTab(item.entityId)
        } else if (item.contentType === 'browser') {
          closeBrowser(item)
        } else if (item.contentType === 'terminal') {
          closeTab(item.entityId)
        } else if (item.contentType === 'simulator' || item.contentType === 'git-graph') {
          closeUnifiedTab(item.id)
        } else if (closeEditorIfUnreferenced(item.entityId, item.id)) {
          closeUnifiedTab(item.id)
        }
      }
    },
    [closeBrowser, closeEditorIfUnreferenced, closeTab, closeUnifiedTab, groupTabs, worktreeId]
  )
  const closeGroup = useCallback(() => {
    const items = (useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []).filter(
      (item) => item.groupId === groupId
    )
    for (const item of items) {
      closeItem(item.id, { skipEmptyCheck: true })
    }
    // Why: empty groups are layout state, so closing their tabs alone cannot
    // remove the placeholder pane shell.
    closeEmptyGroup(worktreeId, groupId)
    leaveWorktreeIfEmpty()
  }, [closeEmptyGroup, closeItem, groupId, leaveWorktreeIfEmpty, worktreeId])
  const closeAllEditorTabsInGroup = useCallback(() => {
    for (const item of groupTabs) {
      if (
        item.contentType === 'editor' ||
        item.contentType === 'diff' ||
        item.contentType === 'conflict-review' ||
        item.contentType === 'check-details'
      ) {
        closeItem(item.id)
      }
    }
  }, [closeItem, groupTabs])
  const closeOthers = useCallback(
    (itemId: string) => {
      if (!groupTabs.some((candidate) => candidate.id === itemId)) {
        return
      }
      // Why: store bulk helpers pre-close dirty tabs before the save dialog;
      // route each candidate through the dirty-aware close path instead.
      closeMany(
        groupTabs
          .filter((candidate) => candidate.id !== itemId && !candidate.isPinned)
          .map((candidate) => candidate.id)
      )
    },
    [closeMany, groupTabs]
  )
  const closeToRight = useCallback(
    (itemId: string) => {
      const order = group?.tabOrder ?? []
      const index = order.indexOf(itemId)
      if (index === -1) {
        return
      }
      const tabById = new Map(groupTabs.map((candidate) => [candidate.id, candidate]))
      closeMany(
        order.slice(index + 1).filter((id) => {
          const candidate = tabById.get(id)
          return candidate ? !candidate.isPinned : false
        })
      )
    },
    [closeMany, group, groupTabs]
  )

  return { closeAllEditorTabsInGroup, closeGroup, closeItem, closeOthers, closeToRight }
}
