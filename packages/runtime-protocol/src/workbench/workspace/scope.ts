import type { WorkspaceKey, WorkspaceScope } from '../types'

export function worktreeWorkspaceKey(worktreeId: string): WorkspaceKey {
  return `worktree:${worktreeId}`
}

export function folderWorkspaceKey(folderWorkspaceId: string): WorkspaceKey {
  return `folder:${folderWorkspaceId}`
}

export function parseWorkspaceKey(value: string): WorkspaceScope | null {
  if (value.startsWith('worktree:')) {
    const worktreeId = value.slice('worktree:'.length)
    return worktreeId.length > 0 ? { type: 'worktree', worktreeId } : null
  }
  if (value.startsWith('folder:')) {
    const folderWorkspaceId = value.slice('folder:'.length)
    return folderWorkspaceId.length > 0 ? { type: 'folder', folderWorkspaceId } : null
  }
  return null
}

export function isWorkspaceKey(value: string): value is WorkspaceKey {
  return parseWorkspaceKey(value) !== null
}

// Why: activeWorktreeId drives the workspace surface users can see. The scoped
// key is only a fallback for legacy folder sessions that did not populate it.
export function getActiveSidebarWorkspaceId(
  activeWorkspaceKey: string | null,
  activeWorktreeId: string | null
): string | null {
  if (activeWorktreeId !== null) {
    return activeWorktreeId
  }
  const scope = activeWorkspaceKey ? parseWorkspaceKey(activeWorkspaceKey) : null
  if (scope?.type === 'folder') {
    return folderWorkspaceKey(scope.folderWorkspaceId)
  }
  return null
}
