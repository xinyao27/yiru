import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/workbench-model/workspace'

import type { Repo } from '../../shared/types'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { spoolActualHostScopeKey, spoolLocalActualHostScopeKey } from './spool-canonical-host-path'

export function resolveDirectSpoolRepoActualHostScope(store: Store, repo: Repo): string | null {
  const executionHostId = getRepoExecutionHostId(repo)
  const host = parseExecutionHostId(executionHostId)
  if (!host || host.kind === 'runtime') {
    return null
  }
  try {
    return host.kind === 'local'
      ? spoolLocalActualHostScopeKey(
          executionHostId,
          resolveSpoolRepoLocalWslDistro(
            repo.path,
            getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null
          )
        )
      : spoolActualHostScopeKey(executionHostId)
  } catch {
    return null
  }
}

export function resolveSpoolRepoLocalWslDistro(
  repoPath: string,
  configuredWslDistro: string | null
): string | null {
  const pathWslDistro = parseWslUncPath(repoPath)?.distro ?? null
  const configured = configuredWslDistro?.trim() || null
  if (pathWslDistro && configured && pathWslDistro.toLowerCase() !== configured.toLowerCase()) {
    // Why: conflicting host evidence cannot safely identify which root namespace is unavailable.
    throw new Error('repo_wsl_scope_mismatch')
  }
  return pathWslDistro ?? configured
}
