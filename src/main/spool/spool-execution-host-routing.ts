import { parseExecutionHostId } from '../../shared/execution-host'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import type { SpoolHostAdapter } from './spool-execution-gateway'

export type SpoolExecutionHostAdapters = {
  local: SpoolHostAdapter
  wsl?: SpoolHostAdapter
  ssh: SpoolHostAdapter
  runtime: SpoolHostAdapter
  isWslTarget?: (target: SpoolPublicWorktreeInstance) => boolean
}

/** Routes by the owner execution host without interpreting remote paths locally. */
export function createSpoolExecutionHostResolver(
  adapters: SpoolExecutionHostAdapters
): (target: SpoolPublicWorktreeInstance) => SpoolHostAdapter | null {
  return (target) => {
    const host = parseExecutionHostId(target.target.executionHostId)
    if (!host) {
      return null
    }
    if (host.kind === 'ssh') {
      return adapters.ssh
    }
    if (host.kind === 'runtime') {
      return adapters.runtime
    }
    if (adapters.wsl && adapters.isWslTarget?.(target)) {
      return adapters.wsl
    }
    return adapters.local
  }
}
