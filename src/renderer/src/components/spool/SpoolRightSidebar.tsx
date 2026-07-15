import type React from 'react'
import { useMemo } from 'react'
import { Files, GitBranch } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { resolveSpoolWorktreeRoute } from '@/store/slices/spool-sharing-selectors'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar-buttons'
import { RightSidebarFrame } from '@/components/right-sidebar/RightSidebarFrame'
import { SpoolFilesPane } from './SpoolFilesPane'
import { SpoolGitPane } from './SpoolGitPane'
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
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const workspace = useAppStore(
    useShallow((state) => (rightSidebarOpen ? resolveSpoolWorktreeRoute(state, route) : null))
  )
  const rightSidebarWidth = useAppStore((state) => state.rightSidebarWidth)
  const rightSidebarTab = useAppStore((state) => state.rightSidebarTab)
  const activityBarPosition = useAppStore((state) => state.activityBarPosition)
  const setRightSidebarWidth = useAppStore((state) => state.setRightSidebarWidth)
  const setRightSidebarTab = useAppStore((state) => state.setRightSidebarTab)
  const showRightSidebarFiles = useAppStore((state) => state.showRightSidebarFiles)
  const toggleRightSidebar = useAppStore((state) => state.toggleRightSidebar)
  const setActivityBarPosition = useAppStore((state) => state.setActivityBarPosition)
  const supportsGit = workspace?.worktree.kind === 'git'
  const activityItems = useMemo<ActivityBarItem[]>(
    () => [
      {
        id: 'explorer',
        icon: Files,
        title: translate('auto.components.right.sidebar.index.8bc2bbc3a0', 'Explorer'),
        shortcut: explorerShortcut === 'Unassigned' ? '' : explorerShortcut
      },
      ...(supportsGit
        ? [
            {
              id: 'source-control' as const,
              icon: GitBranch,
              title: translate('auto.components.right.sidebar.index.0314901467', 'Source Control'),
              shortcut: sourceControlShortcut === 'Unassigned' ? '' : sourceControlShortcut
            }
          ]
        : [])
    ],
    [explorerShortcut, sourceControlShortcut, supportsGit]
  )
  const activeTab: ActiveRightSidebarTab =
    supportsGit && rightSidebarTab === 'source-control' ? 'source-control' : 'explorer'

  if (rightSidebarOpen && !workspace) {
    return null
  }

  const selectTab = (tab: ActiveRightSidebarTab): void => {
    if (tab === 'source-control' && supportsGit) {
      setRightSidebarTab(tab)
      return
    }
    showRightSidebarFiles()
  }

  return (
    <RightSidebarFrame
      activeTab={activeTab}
      activityBarPosition={activityBarPosition}
      isOpen={rightSidebarOpen}
      items={activityItems}
      onActivityBarPositionChange={setActivityBarPosition}
      onSelectTab={selectTab}
      onToggle={toggleRightSidebar}
      onWidthChange={setRightSidebarWidth}
      toggleShortcut={rightSidebarShortcut}
      width={rightSidebarWidth}
    >
      {activeTab === 'source-control' && supportsGit ? (
        <SpoolGitPane route={route} />
      ) : (
        <SpoolFilesPane route={route} supportsDiff={supportsGit} />
      )}
    </RightSidebarFrame>
  )
}

export default SpoolRightSidebar
