// Mirrors FLOATING_TERMINAL_WORKTREE_ID on the host. The synthetic workspace
// has no backing repo/worktree and always runs on the paired runtime itself.
export const FLOATING_WORKSPACE_WORKTREE_ID = 'global-floating-terminal'

export const FLOATING_WORKSPACE_TITLE = 'Floating Workspace'

export function isFloatingWorkspaceWorktreeId(worktreeId: string | null | undefined): boolean {
  return worktreeId === FLOATING_WORKSPACE_WORKTREE_ID
}

// Why: the title seed keeps route restoration readable before host-owned tabs load.
export function floatingWorkspaceSessionPath(hostId: string | undefined): string {
  return `/h/${hostId}/session/${FLOATING_WORKSPACE_WORKTREE_ID}?name=${encodeURIComponent(FLOATING_WORKSPACE_TITLE)}`
}
