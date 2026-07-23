import type { AiVaultScope } from '@yiru/workbench-model/agent'

export function shouldShowMobileCurrentWorktreeBadge(scope: AiVaultScope): boolean {
  // Why: Workspace is already the current-worktree-only view; Project and All
  // still mix in sibling/other worktrees, so the badge remains useful there.
  return scope !== 'workspace'
}
