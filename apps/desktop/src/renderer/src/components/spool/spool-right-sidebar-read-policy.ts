import type { ActiveRightSidebarTab } from '@/store/slices/editor'

export function shouldReadSpoolChecks(args: {
  activeTab: ActiveRightSidebarTab
  rightSidebarOpen: boolean
  connected: boolean
  supportsGit: boolean
}): boolean {
  // Why: a cold remote check lookup is expensive and must not contend with
  // the Explorer, Git, or terminal requests needed to make a worktree usable.
  return args.rightSidebarOpen && args.connected && args.supportsGit && args.activeTab === 'checks'
}
