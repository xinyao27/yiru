import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import {
  repoHostId,
  repoHasExecutionHost,
  getProjectHostSetupForRepoHost,
  worktreeHostMatchOptions,
  mergeDetectedWorktreesForHost
} from './worktree-host-model'
import { notifyRuntimeScopeForbiddenIfNeeded } from './worktree-known-model'
import { areDetectedWorktreeResultsEqual } from './worktree-refresh-model'
import {
  settingsForRepoOwner,
  listDetectedWorktreesForRepoCoalesced
} from './worktree-runtime-list-model'
import type { WorktreeSlice } from './worktree-state'

export function createWorktreeDetectedFetchActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'fetchDetectedWorktrees'> {
  return {
    fetchDetectedWorktrees: async (repoId) => {
      try {
        const ownerState = get()
        const hostId = repoHostId(ownerState, repoId)
        const ownerWasMissingAtStart = !ownerState.repos.some((repo) => repo.id === repoId)
        const setup = getProjectHostSetupForRepoHost(ownerState, repoId, hostId)
        const result = await listDetectedWorktreesForRepoCoalesced(
          settingsForRepoOwner(ownerState, repoId, hostId),
          repoId,
          { executionHostId: hostId }
        )
        set((s) => {
          if (!repoHasExecutionHost(s, repoId, hostId, ownerWasMissingAtStart)) {
            return s
          }
          // Why: detected-only refreshes can overlap host-scoped visible refreshes;
          // keep detected state stamped/merged so SSH/runtime rows are not clobbered.
          const mergedDetected = mergeDetectedWorktreesForHost(
            s.detectedWorktreesByRepo[repoId],
            result,
            hostId,
            setup,
            worktreeHostMatchOptions(s, repoId, hostId)
          )
          return areDetectedWorktreeResultsEqual(s.detectedWorktreesByRepo[repoId], mergedDetected)
            ? s
            : {
                detectedWorktreesByRepo: { ...s.detectedWorktreesByRepo, [repoId]: mergedDetected }
              }
        })
        return result
      } catch (err) {
        if (notifyRuntimeScopeForbiddenIfNeeded(err)) {
          return null
        }
        console.error(`Failed to fetch detected worktrees for repo ${repoId}:`, err)
        return null
      }
    }
  }
}
