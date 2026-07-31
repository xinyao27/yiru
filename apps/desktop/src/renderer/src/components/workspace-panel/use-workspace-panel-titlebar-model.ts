import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import { useCallback, useMemo } from 'react'

import type { ActiveRightSidebarTab } from '@/components/editor/state'
import {
  getLocalFileManagerLabel,
  getPreferredWorktreeOpenInEntry,
  getWorktreeOpenInEntries,
  openWorktreePath
} from '@/components/sidebar/worktree-open-in-menu'
import { useShortcutKeyDetails, type ShortcutKeyComboDetails } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { openWorkspacePanelTab } from '@/lib/open-workspace-panel-tab'
import { canShowRightSidebarForView } from '@/lib/right-sidebar-visibility'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import {
  splitWorkspacePanelTitlebarItems,
  WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID,
  WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID,
  type WorkspaceTitlebarActionId
} from '../../../../shared/workspace/panel-titlebar-pinned'
import type { ActivityBarItem } from './activity-bar-buttons'
import {
  resolveItemIcon,
  resolvePanelIcon,
  type WorkspacePanelTitlebarDropTarget,
  type WorkspaceTitlebarStripItem
} from './titlebar-strip-items'
import { useRightSidebarActivityItems } from './use-right-sidebar-activity-items'
import {
  useWorkspacePanelTitlebarPinDrag,
  type PanelTitlebarDragSource
} from './use-workspace-panel-titlebar-pin-drag'

export type {
  WorkspacePanelTitlebarDropTarget,
  WorkspaceTitlebarStripItem
} from './titlebar-strip-items'

export type WorkspacePanelTitlebarModel = {
  worktreeId: string
  groupId: string
  visibleItems: WorkspaceTitlebarStripItem[]
  overflowItems: WorkspaceTitlebarStripItem[]
  activeTabContentType: string | null
  dropTarget: WorkspacePanelTitlebarDropTarget
  isPanelDragActive: boolean
  resolvePanelIcon: (item: ActivityBarItem, active: boolean) => ActivityBarItem['icon']
  resolveItemIcon: (item: WorkspaceTitlebarStripItem, active: boolean) => ActivityBarItem['icon']
  shortcutFor: (id: ActiveRightSidebarTab) => ShortcutKeyComboDetails | null
  togglePanel: (id: ActiveRightSidebarTab) => void
  activateItem: (item: WorkspaceTitlebarStripItem) => void
  handleItemPointerDown: (
    event: React.PointerEvent,
    id: WorkspaceTitlebarActionId,
    source: PanelTitlebarDragSource
  ) => void
}

export function useWorkspacePanelTitlebarModel(
  worktreeId: string,
  groupId: string
): WorkspacePanelTitlebarModel | null {
  const activeView = useAppStore((state) => state.activeView)
  const activeTabContentType = useAppStore((state) => {
    return state.getActiveTab(worktreeId)?.contentType ?? null
  })
  const pinnedIds = useAppStore((state) => state.workspacePanelTitlebarPinnedIds)
  const setPinnedIds = useAppStore((state) => state.setWorkspacePanelTitlebarPinnedIds)
  const worktree = useAppStore((state) => state.getKnownWorktreeById(worktreeId) ?? null)
  const repos = useAppStore((state) => state.repos)
  const repoConnectionId = useAppStore((state) => {
    const repoId = state.getKnownWorktreeById(worktreeId)?.repoId
    if (!repoId) {
      return null
    }
    return state.repos.find((repo) => repo.id === repoId)?.connectionId ?? null
  })
  const runtimeEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  )
  const openInApplications = useAppStore((state) => state.settings?.openInApplications ?? [])
  const lastOpenInTargetKey = useAppStore((state) => state.settings?.lastOpenInTargetKey)
  const { items: panelItems } = useRightSidebarActivityItems(worktreeId)
  const canShowCommands = useMemo(() => {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      return false
    }
    const candidate = getRepoIdFromWorktreeId(worktreeId)
    return repos.some((repo) => repo.id === candidate)
  }, [repos, worktreeId])
  const explorerShortcut = useShortcutKeyDetails('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutKeyDetails('sidebar.sourceControl.toggle')
  const portsShortcut = useShortcutKeyDetails('sidebar.ports.toggle')

  const catalogItems = useMemo<WorkspaceTitlebarStripItem[]>(() => {
    const panels: WorkspaceTitlebarStripItem[] = panelItems.map((panel) => ({
      id: panel.id,
      kind: 'panel',
      panel
    }))
    const items: WorkspaceTitlebarStripItem[] = [
      ...panels,
      {
        id: WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID,
        kind: 'open-in',
        title: translate('auto.components.workspace.panel.titlebar.openIn', 'Open in editor')
      }
    ]
    if (canShowCommands) {
      items.push({
        id: WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID,
        kind: 'commands',
        title: translate('auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831', 'Command')
      })
    }
    return items
  }, [canShowCommands, panelItems])

  const { visibleItems, overflowItems } = splitWorkspacePanelTitlebarItems(catalogItems, pinnedIds)
  // Why: catalog filtering can leave persisted pins empty/stale; mutate from
  // the ids currently rendered so drag never operates on a phantom list.
  const effectivePinnedIds = visibleItems.map((item) => item.id)

  const shortcutFor = useCallback(
    (id: ActiveRightSidebarTab): ShortcutKeyComboDetails | null => {
      switch (id) {
        case 'explorer':
          return explorerShortcut
        case 'source-control':
          return sourceControlShortcut
        case 'ports':
          return portsShortcut
        case 'vault':
        case 'workspaces':
        case 'pr-checks':
          return null
      }
    },
    [explorerShortcut, portsShortcut, sourceControlShortcut]
  )

  const commitPinned = useCallback(
    (next: readonly WorkspaceTitlebarActionId[]) => {
      setPinnedIds(next)
    },
    [setPinnedIds]
  )

  const { dropTarget, isPanelDragActive, handleItemPointerDown } = useWorkspacePanelTitlebarPinDrag(
    {
      worktreeId,
      effectivePinnedIds,
      visibleCount: visibleItems.length,
      commitPinned
    }
  )

  const togglePanel = useCallback(
    (id: ActiveRightSidebarTab) => {
      const state = useAppStore.getState()
      const activeTabId = (state.groupsByWorktree[worktreeId] ?? []).find(
        (group) => group.id === groupId
      )?.activeTabId
      const activeTab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
        (tab) => tab.id === activeTabId
      )
      if (activeTab?.contentType === id) {
        state.closeUnifiedTab(activeTab.id)
        return
      }
      openWorkspacePanelTab({ panel: id, worktreeId, groupId })
    },
    [groupId, worktreeId]
  )

  const activateItem = useCallback(
    (item: WorkspaceTitlebarStripItem) => {
      if (item.kind === 'panel') {
        togglePanel(item.id)
        return
      }
      if (item.kind === 'commands') {
        // Why: Command owns its picker dialog; overflow rows render that control
        // directly instead of going through this activator.
        return
      }
      if (!worktree || worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
        return
      }
      const preferredEntry = getPreferredWorktreeOpenInEntry(
        getWorktreeOpenInEntries(openInApplications, getLocalFileManagerLabel()),
        lastOpenInTargetKey
      )
      if (!preferredEntry) {
        return
      }
      void openWorktreePath({
        target: preferredEntry.target,
        worktreePath: worktree.path,
        connectionId: repoConnectionId,
        runtimeEnvironmentId,
        command: preferredEntry.command
      })
    },
    [
      lastOpenInTargetKey,
      openInApplications,
      togglePanel,
      repoConnectionId,
      runtimeEnvironmentId,
      worktree,
      worktreeId
    ]
  )

  if (!canShowRightSidebarForView(activeView) || catalogItems.length === 0) {
    return null
  }

  return {
    worktreeId,
    groupId,
    visibleItems,
    overflowItems,
    activeTabContentType,
    dropTarget,
    isPanelDragActive,
    resolvePanelIcon,
    resolveItemIcon,
    shortcutFor,
    togglePanel,
    activateItem,
    handleItemPointerDown
  }
}
