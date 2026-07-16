import type React from 'react'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { resolveSpoolWorktreeRoute } from '@/store/slices/spool-sharing-selectors'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar-buttons'
import { getVisibleRightSidebarActivityItems } from '@/components/right-sidebar/right-sidebar-activity-visibility'
import { createRightSidebarActivityItems } from '@/components/right-sidebar/right-sidebar-activity-items'
import { resolveRightSidebarEffectiveTab } from '@/components/right-sidebar/right-sidebar-effective-tab'
import { RightSidebarFrame } from '@/components/right-sidebar/RightSidebarFrame'
import { normalizeRightSidebarRoute } from '@/store/right-sidebar-route'
import { SpoolAgentsPane } from './SpoolAgentsPane'
import { SpoolChecksPane, useSpoolChecksReadState } from './SpoolChecksPane'
import { SpoolFilesPane } from './SpoolFilesPane'
import { SpoolGitPane } from './SpoolGitPane'
import { shouldReadSpoolChecks } from './spool-right-sidebar-read-policy'
import { getSpoolWorktreeRouteKey } from './spool-worktree-route'

export function SpoolRightSidebar({
  route
}: {
  route: SpoolWorkspaceRoute
}): React.JSX.Element | null {
  // Why: navigation and checked-operation state must not cross a remote worktree or socket epoch.
  return <SpoolRightSidebarContent key={getSpoolWorktreeRouteKey(route)} route={route} />
}

function SpoolRightSidebarContent({
  route
}: {
  route: SpoolWorkspaceRoute
}): React.JSX.Element | null {
  const rightSidebarShortcut = useShortcutLabel('sidebar.right.toggle')
  const explorerShortcut = useShortcutLabel('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutLabel('sidebar.sourceControl.toggle')
  const checksShortcut = useShortcutLabel('sidebar.checks.toggle')
  const portsShortcut = useShortcutLabel('sidebar.ports.toggle')
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const workspace = useAppStore(
    useShallow((state) => (rightSidebarOpen ? resolveSpoolWorktreeRoute(state, route) : null))
  )
  const rightSidebarWidth = useAppStore((state) => state.rightSidebarWidth)
  const rightSidebarTab = useAppStore((state) => state.rightSidebarTab)
  const activityBarPosition = useAppStore((state) => state.activityBarPosition)
  const setRightSidebarWidth = useAppStore((state) => state.setRightSidebarWidth)
  const setRightSidebarTab = useAppStore((state) => state.setRightSidebarTab)
  const toggleRightSidebar = useAppStore((state) => state.toggleRightSidebar)
  const setActivityBarPosition = useAppStore((state) => state.setActivityBarPosition)
  const supportsGit = workspace?.worktree.kind === 'git'
  const connected = workspace?.desktop.connectionStatus === 'connected'
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
        isFolder: !supportsGit,
        isFolderWorkspace: false,
        isSshRepo: false
      }),
    [activityItems, supportsGit]
  )
  const activeTab = resolveRightSidebarEffectiveTab({
    normalizedActiveTab: normalizeRightSidebarRoute(rightSidebarTab).rightSidebarTab,
    visibleItems,
    activeFolderWorkspaceKey: null,
    rememberedFolderTab: null
  })
  const checksReadEnabled = shouldReadSpoolChecks({
    activeTab,
    rightSidebarOpen,
    connected,
    supportsGit
  })
  const checksState = useSpoolChecksReadState(route, checksReadEnabled)
  const checksStatus = checksReadEnabled ? (checksState.result?.review?.status ?? null) : null

  if (rightSidebarOpen && !workspace) {
    return null
  }

  const selectTab = (tab: ActiveRightSidebarTab): void => {
    if (visibleItems.some((item) => item.id === tab)) {
      // Why: the local worktree remains mounted behind a Spool route; remote
      // navigation must not persist Explorer state into that hidden workspace.
      setRightSidebarTab(tab)
    }
  }

  return (
    <RightSidebarFrame
      activeTab={activeTab}
      activityBarPosition={activityBarPosition}
      checksStatus={checksStatus}
      isOpen={rightSidebarOpen}
      items={visibleItems}
      onActivityBarPositionChange={setActivityBarPosition}
      onSelectTab={selectTab}
      onToggle={toggleRightSidebar}
      onWidthChange={setRightSidebarWidth}
      toggleShortcut={rightSidebarShortcut}
      width={rightSidebarWidth}
    >
      {activeTab === 'explorer' ? (
        <SpoolFilesPane route={route} supportsDiff={supportsGit} />
      ) : null}
      {activeTab === 'vault' ? (
        <SpoolAgentsPane
          route={route}
          sessions={workspace?.worktree.sessions ?? []}
          catalogStatus={workspace?.worktree.sessionCatalog.status ?? 'loading'}
        />
      ) : null}
      {activeTab === 'source-control' && supportsGit ? <SpoolGitPane route={route} /> : null}
      {activeTab === 'checks' && supportsGit ? <SpoolChecksPane state={checksState} /> : null}
    </RightSidebarFrame>
  )
}

export default SpoolRightSidebar
