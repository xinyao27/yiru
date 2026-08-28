import { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'

import { getUnreadBadgeCount } from './unread-badge-count'

function setUnreadDockBadgeCountBestEffort(count: number): void {
  void shellClient.app.setUnreadDockBadgeCount(count).catch(() => {
    // Dock sync is best-effort chrome; stale badge state should not affect app use.
  })
}

export function clearUnreadDockBadgeCount(): void {
  setUnreadDockBadgeCountBestEffort(0)
}

export function useUnreadDockBadge(): typeof clearUnreadDockBadgeCount {
  const catalog = useProjectCatalog()
  const { worktreesByRepo } = projectCatalogRepoBuckets(catalog)
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const unreadTerminalTabs = useAppStore((state) => state.unreadTerminalTabs)
  const unreadCount = getUnreadBadgeCount({
    tabsByWorktree,
    unreadTerminalTabs,
    worktreesByRepo
  })

  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- Why: this syncs an external OS dock badge, not React render state.
  useEffect(() => {
    setUnreadDockBadgeCountBestEffort(unreadCount)
  }, [unreadCount])

  return clearUnreadDockBadgeCount
}
