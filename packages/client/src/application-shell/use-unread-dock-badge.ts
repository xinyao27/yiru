import { useEffect } from 'react'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store'

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
  const unreadCount = useAppStore((state) =>
    getUnreadBadgeCount({
      worktreesByRepo: state.worktreesByRepo,
      tabsByWorktree: state.tabsByWorktree,
      unreadTerminalTabs: state.unreadTerminalTabs
    })
  )

  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- Why: this syncs an external OS dock badge, not React render state.
  useEffect(() => {
    setUnreadDockBadgeCountBestEffort(unreadCount)
  }, [unreadCount])

  return clearUnreadDockBadgeCount
}
