import React, { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'
import { useRepoById } from '@/store/selectors'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { getActiveChecksStatus } from './active-checks-status'
import { getVisibleRightSidebarActivityItems } from './right-sidebar-activity-visibility'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { RightSidebarPanelContent } from './right-sidebar-panel-content'
import { normalizeRightSidebarRoute } from '@/store/right-sidebar-route'
import { resolveRightSidebarEffectiveTab } from './right-sidebar-effective-tab'
import type { ActivityBarItem } from './activity-bar-buttons'
import { RightSidebarFrame } from './right-sidebar-frame'
import { createRightSidebarActivityItems } from './right-sidebar-activity-items'

function RightSidebarInner(): React.JSX.Element {
  const rightSidebarShortcut = useShortcutLabel('sidebar.right.toggle')
  const explorerShortcut = useShortcutLabel('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutLabel('sidebar.sourceControl.toggle')
  const checksShortcut = useShortcutLabel('sidebar.checks.toggle')
  const portsShortcut = useShortcutLabel('sidebar.ports.toggle')
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const rightSidebarWidth = useAppStore((state) => state.rightSidebarWidth)
  const setRightSidebarWidth = useAppStore((state) => state.setRightSidebarWidth)
  const rightSidebarTab = useAppStore((state) => state.rightSidebarTab)
  const rightSidebarRouteRequestId = useAppStore((state) => state.rightSidebarRouteRequestId)
  const setRightSidebarTab = useAppStore((state) => state.setRightSidebarTab)
  const showRightSidebarFiles = useAppStore((state) => state.showRightSidebarFiles)
  const toggleRightSidebar = useAppStore((state) => state.toggleRightSidebar)
  const checksStatus = useAppStore((state) =>
    state.rightSidebarOpen ? getActiveChecksStatus(state) : null
  )
  const activityBarPosition = useAppStore((state) => state.activityBarPosition)
  const setActivityBarPosition = useAppStore((state) => state.setActivityBarPosition)
  const activeWorktreeId = useAppStore((state) =>
    rightSidebarOpen ? state.activeWorktreeId : null
  )
  // Why: source control and checks are meaningless for non-git folders.
  const activeWorktree = useAppStore((state) =>
    activeWorktreeId ? (state.getKnownWorktreeById(activeWorktreeId) ?? null) : null
  )
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const activeWorkspaceScope = parseWorkspaceKey(activeWorktreeId ?? '')
  const isFolderWorkspace = activeWorkspaceScope?.type === 'folder'
  const isFolder = isFolderWorkspace || (activeRepo ? isFolderRepo(activeRepo) : false)
  const isSshRepo = Boolean(activeRepo?.connectionId)

  const activityItems = useMemo<ActivityBarItem[]>(
    () =>
      createRightSidebarActivityItems({
        explorer: explorerShortcut,
        sourceControl: sourceControlShortcut,
        checks: checksShortcut,
        ports: portsShortcut
      }),
    [checksShortcut, explorerShortcut, portsShortcut, sourceControlShortcut]
  )
  const visibleItems = useMemo(
    () =>
      getVisibleRightSidebarActivityItems(activityItems, {
        isFolder,
        isFolderWorkspace,
        isSshRepo
      }),
    [activityItems, isFolder, isFolderWorkspace, isSshRepo]
  )
  const rememberedFolderTabByWorkspaceKeyRef = useRef<Record<string, ActiveRightSidebarTab>>({})
  const lastRightSidebarRouteRequestIdRef = useRef(rightSidebarRouteRequestId)
  const activeFolderWorkspaceKey = isFolderWorkspace ? (activeWorktreeId ?? null) : null
  const normalizedActiveTab = normalizeRightSidebarRoute(rightSidebarTab).rightSidebarTab
  const rememberedFolderTab = activeFolderWorkspaceKey
    ? rememberedFolderTabByWorkspaceKeyRef.current[activeFolderWorkspaceKey]
    : null
  const requestedFolderTab =
    activeFolderWorkspaceKey &&
    rightSidebarRouteRequestId !== lastRightSidebarRouteRequestIdRef.current
      ? normalizedActiveTab
      : null
  const effectiveTab = resolveRightSidebarEffectiveTab({
    normalizedActiveTab,
    visibleItems,
    activeFolderWorkspaceKey,
    rememberedFolderTab: requestedFolderTab ?? rememberedFolderTab
  })

  useEffect(() => {
    lastRightSidebarRouteRequestIdRef.current = rightSidebarRouteRequestId
  }, [rightSidebarRouteRequestId])

  useEffect(() => {
    if (!activeFolderWorkspaceKey || !visibleItems.some((item) => item.id === effectiveTab)) {
      return
    }
    rememberedFolderTabByWorkspaceKeyRef.current[activeFolderWorkspaceKey] = effectiveTab
  }, [activeFolderWorkspaceKey, effectiveTab, visibleItems])

  const selectActivityTab = (tab: ActiveRightSidebarTab): void => {
    if (activeFolderWorkspaceKey) {
      rememberedFolderTabByWorkspaceKeyRef.current[activeFolderWorkspaceKey] = tab
    }
    if (tab === 'explorer') {
      showRightSidebarFiles()
      return
    }
    setRightSidebarTab(tab)
  }

  return (
    <RightSidebarFrame
      activeTab={effectiveTab}
      activityBarPosition={activityBarPosition}
      checksStatus={checksStatus}
      isOpen={rightSidebarOpen}
      items={visibleItems}
      onActivityBarPositionChange={setActivityBarPosition}
      onSelectTab={selectActivityTab}
      onToggle={toggleRightSidebar}
      onWidthChange={setRightSidebarWidth}
      toggleShortcut={rightSidebarShortcut}
      width={rightSidebarWidth}
    >
      {/* Why: panels react to worktree changes themselves; remounting here creates an IPC storm. */}
      <RightSidebarPanelContent effectiveTab={effectiveTab} rightSidebarOpen={rightSidebarOpen} />
    </RightSidebarFrame>
  )
}

const RightSidebar = React.memo(RightSidebarInner)
export default RightSidebar
