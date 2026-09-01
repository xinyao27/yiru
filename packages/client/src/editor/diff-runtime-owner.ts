import type { AppState } from '~renderer/store/types'
import { getExplicitRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

export function resolveDiffRuntimeEnvironmentId(
  state: AppState,
  worktreeId: string,
  explicitRuntimeEnvironmentId: string | null | undefined
): string | null | undefined {
  if (explicitRuntimeEnvironmentId !== undefined) {
    return explicitRuntimeEnvironmentId
  }
  // Why: owner-less/local resolves to null so a focused remote runtime cannot
  // redirect a local worktree diff to the wrong host.
  return getExplicitRuntimeEnvironmentIdForWorktree(state, worktreeId) ?? null
}
