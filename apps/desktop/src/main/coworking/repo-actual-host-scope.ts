import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/workbench-model/workspace'
import type { Repo } from '~shared/types'

import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import {
  coworkingActualHostScopeKey,
  coworkingLocalActualHostScopeKey
} from './canonical-host-path'

export function resolveDirectCoworkingRepoActualHostScope(store: Store, repo: Repo): string | null {
  const executionHostId = getRepoExecutionHostId(repo)
  const host = parseExecutionHostId(executionHostId)
  if (!host || host.kind === 'runtime') {
    return null
  }
  try {
    return host.kind === 'local'
      ? coworkingLocalActualHostScopeKey(
          executionHostId,
          resolveCoworkingRepoLocalWslDistro(
            repo.path,
            getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null
          )
        )
      : coworkingActualHostScopeKey(executionHostId)
  } catch {
    return null
  }
}

export function resolveCoworkingRepoLocalWslDistro(
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
