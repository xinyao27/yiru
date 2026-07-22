import React, { useEffect, useRef } from 'react'

import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { useAppStore } from '@/store'
import { normalizeRightSidebarRoute } from '@/store/right-sidebar-route'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'

import { getActiveChecksStatus } from './active-checks-status'
import { resolveRightSidebarEffectiveTab } from './right-sidebar-effective-tab'
import { RightSidebarFrame } from './right-sidebar-frame'
import { RightSidebarPanelContent } from './right-sidebar-panel-content'
import { useRightSidebarActivityItems } from './use-right-sidebar-activity-items'

function RightSidebarInner(): React.JSX.Element {
  const rightSidebarShortcut = useShortcutLabel('sidebar.right.toggle')
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
  const { isFolderWorkspace, items: visibleItems } = useRightSidebarActivityItems(activeWorktreeId)
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
