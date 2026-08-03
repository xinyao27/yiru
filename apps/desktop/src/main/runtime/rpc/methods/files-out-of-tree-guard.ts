import type { RpcCallerClass } from '../access'

/**
 * Guard for the file methods that are not bounded by a worktree.
 *
 * Why: `files.browseServerDir` takes only a path (`''`/`~`/absolute all resolve),
 * and the terminal-artifact trio reads and writes absolute paths outside any
 * worktree. They exist for the owner's own clients — the repo picker and the
 * mobile tap-to-open-artifact flow — and are the widest filesystem surface on
 * the RPC boundary. A Coworking peer must never reach them: worktree containment
 * is the only preventive control a host grant leaves in place, and these methods
 * walk straight around it.
 */
function mayReachOutsideWorktree(caller: RpcCallerClass): boolean {
  switch (caller) {
    case 'local':
    case 'runtime':
    case 'mobile':
      return true
    case 'coworking-host':
      return false
  }
}

export function assertOutOfTreeFileAccess(caller: RpcCallerClass, method: string): void {
  if (mayReachOutsideWorktree(caller)) {
    return
  }
  // Why: a stable snake_case code matching the existing denial convention
  // (see requirePairedRuntimePrincipal), so callers can branch on it.
  throw new Error(`out_of_tree_file_access_forbidden:${method}`)
}
