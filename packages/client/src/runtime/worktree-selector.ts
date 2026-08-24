const RUNTIME_WORKTREE_ID_SELECTOR_PREFIX = 'id:'
const RUNTIME_WORKTREE_PATH_SELECTOR_PREFIX = 'path:'

/** Address a raw worktree id as a runtime `id:` selector; passes through empty or already-prefixed values. */
export function toRuntimeWorktreeSelector(worktreeId: string): string {
  const trimmed = worktreeId.trim()
  if (!trimmed || trimmed.startsWith(RUNTIME_WORKTREE_ID_SELECTOR_PREFIX)) {
    return trimmed
  }
  return `${RUNTIME_WORKTREE_ID_SELECTOR_PREFIX}${trimmed}`
}

export function toRuntimeWorktreePathSelector(worktreePath: string): string {
  const trimmed = worktreePath.trim()
  if (!trimmed || trimmed.startsWith(RUNTIME_WORKTREE_PATH_SELECTOR_PREFIX)) {
    return trimmed
  }
  return `${RUNTIME_WORKTREE_PATH_SELECTOR_PREFIX}${trimmed}`
}

export function toRuntimeTerminalWorktreeSelector(worktreeId: string): string {
  return toRuntimeWorktreeSelector(worktreeId)
}
