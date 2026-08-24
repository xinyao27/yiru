import type { AppState } from '~renderer/store/types'

export function isUnifiedTabActiveInActiveGroup(
  state: AppState,
  worktreeId: string,
  unifiedTabId: string
): boolean {
  const activeGroupId = state.activeGroupIdByWorktree[worktreeId]
  return (
    state.groupsByWorktree[worktreeId]?.some(
      (group) => group.id === activeGroupId && group.activeTabId === unifiedTabId
    ) === true
  )
}
