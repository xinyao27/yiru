import {
  CLIENT_WORKTREE_CREATE_MAX_ATTEMPTS,
  getClientWorktreeCreateCandidate,
  isRetryableWorktreeCreateConflict
} from '@yiru/workbench-model/review'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { folderWorkspaceKey, parseWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import {
  withRepoHostOwnership,
  repoHostId,
  getProjectHostSetupForRepoHost
} from './worktree-host-model'
import { publishLocalBaseRefRefreshResult } from './worktree-refresh-model'
import { settingsForRepoOwner } from './worktree-runtime-list-model'
import type { WorktreeSlice } from './worktree-state'

export function createWorktreeCreateActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'prefetchWorktreeCreateBase' | 'createWorktree'> {
  return {
    prefetchWorktreeCreateBase: async (repoId, baseBranch) => {
      try {
        const target = getActiveRuntimeTarget(settingsForRepoOwner(get(), repoId))
        if (target.kind === 'local') {
          await workspaceHostClient.worktrees.prefetchCreateBase({
            repoId,
            ...(baseBranch ? { baseBranch } : {})
          })
          return
        }
        await callRuntimeOrpc(
          target,
          (client) => client.worktree.prefetchCreateBase,
          { repo: repoId, ...(baseBranch ? { baseBranch } : {}) },
          { timeoutMs: 30_000 }
        )
      } catch {
        // Why: prefetch is only a latency hedge. The create path awaits the same
        // backend refresh and owns user-visible error reporting.
      }
    },
    createWorktree: async (
      repoId,
      name,
      baseBranch,
      setupDecision = 'inherit',
      sparseCheckout,
      telemetrySource,
      displayName,
      linkedPR,
      pushTarget,
      createdWithAgent,
      branchNameOverride,
      workspaceStatus,
      linkedGitLabMR,
      startup,
      pendingFirstAgentMessageRename,
      creationId,
      linkedBitbucketPR,
      linkedAzureDevOpsPR,
      linkedGiteaPR,
      compareBaseRef
    ) => {
      try {
        for (let attempt = 0; attempt < CLIENT_WORKTREE_CREATE_MAX_ATTEMPTS; attempt += 1) {
          const candidateName = getClientWorktreeCreateCandidate(name, attempt)
          // Why: older runtimes may still reject exact PR branch overrides on
          // collision, so the renderer retries both branch and worktree names.
          const candidateBranchNameOverride = branchNameOverride
            ? getClientWorktreeCreateCandidate(branchNameOverride, attempt)
            : undefined
          try {
            // Why: Manual sort is user-authored order. Stamp new workspaces
            // deliberately at the top instead of relying on sortOrder fallback.
            const manualOrder = get().sortBy === 'manual' ? Date.now() : undefined
            const activeScope = parseWorkspaceKey(get().activeWorkspaceKey ?? '')
            const parentWorkspace =
              activeScope?.type === 'folder'
                ? folderWorkspaceKey(activeScope.folderWorkspaceId)
                : undefined
            const createArgs = {
              repoId,
              name: candidateName,
              baseBranch,
              ...(compareBaseRef ? { compareBaseRef } : {}),
              ...(candidateBranchNameOverride
                ? { branchNameOverride: candidateBranchNameOverride }
                : {}),
              setupDecision,
              sparseCheckout,
              ...(displayName ? { displayName } : {}),
              ...(telemetrySource ? { telemetrySource } : {}),
              ...(linkedPR !== undefined ? { linkedPR } : {}),
              ...(pushTarget ? { pushTarget } : {}),
              ...(createdWithAgent ? { createdWithAgent } : {}),
              ...(pendingFirstAgentMessageRename === true && createdWithAgent
                ? { pendingFirstAgentMessageRename: true }
                : {}),
              ...(manualOrder !== undefined ? { manualOrder } : {}),
              ...(parentWorkspace ? { parentWorkspace } : {}),
              ...(workspaceStatus !== undefined ? { workspaceStatus } : {}),
              ...(linkedGitLabMR !== undefined ? { linkedGitLabMR } : {}),
              ...(linkedBitbucketPR !== undefined ? { linkedBitbucketPR } : {}),
              ...(linkedAzureDevOpsPR !== undefined ? { linkedAzureDevOpsPR } : {}),
              ...(linkedGiteaPR !== undefined ? { linkedGiteaPR } : {}),
              ...(startup ? { startup } : {}),
              ...(creationId ? { creationId } : {})
            }
            const target = getActiveRuntimeTarget(settingsForRepoOwner(get(), repoId))
            const result =
              target.kind === 'local'
                ? await workspaceHostClient.worktrees.create(createArgs)
                : await callRuntimeOrpc(
                    target,
                    (client) => client.worktree.create,
                    {
                      repo: repoId,
                      name: candidateName,
                      baseBranch,
                      ...(compareBaseRef ? { compareBaseRef } : {}),
                      ...(candidateBranchNameOverride
                        ? { branchNameOverride: candidateBranchNameOverride }
                        : {}),
                      setupDecision,
                      sparseCheckout,
                      ...(displayName ? { displayName } : {}),
                      ...(telemetrySource ? { telemetrySource } : {}),
                      ...(linkedPR !== undefined ? { linkedPR } : {}),
                      ...(pushTarget ? { pushTarget } : {}),
                      ...(createdWithAgent ? { createdWithAgent } : {}),
                      ...(manualOrder !== undefined ? { manualOrder } : {}),
                      ...(parentWorkspace ? { parentWorkspace } : {}),
                      ...(workspaceStatus !== undefined ? { workspaceStatus } : {}),
                      ...(linkedGitLabMR !== undefined ? { linkedGitLabMR } : {}),
                      ...(linkedBitbucketPR !== undefined ? { linkedBitbucketPR } : {}),
                      ...(linkedAzureDevOpsPR !== undefined ? { linkedAzureDevOpsPR } : {}),
                      ...(linkedGiteaPR !== undefined ? { linkedGiteaPR } : {}),
                      ...(startup
                        ? {
                            startupCommand: startup.command,
                            ...(startup.env ? { startupEnv: startup.env } : {}),
                            ...(startup.launchConfig
                              ? { startupLaunchConfig: startup.launchConfig }
                              : {}),
                            ...(startup.startupCommandDelivery
                              ? { startupCommandDelivery: startup.startupCommandDelivery }
                              : {}),
                            activate: true
                          }
                        : {})
                    },
                    { timeoutMs: 10 * 60_000 }
                  )
            // Why: a file watcher (worktrees.onChanged) can fire between the
            // backend creating the worktree and this callback running, causing
            // fetchWorktrees to add the worktree first. Appending unconditionally
            // then produces a duplicate entry in worktreesByRepo, which gives
            // React duplicate keys and can corrupt terminal DOM containers.
            set((s) => {
              const hostId = repoHostId(s, repoId)
              const createdWorktree = withRepoHostOwnership(
                result.worktree,
                hostId,
                getProjectHostSetupForRepoHost(s, repoId, hostId)
              )
              const current = s.worktreesByRepo[repoId] ?? []
              const alreadyPresent = current.some((w) => w.id === createdWorktree.id)
              const nextWorktrees = alreadyPresent
                ? current.map((worktree) =>
                    worktree.id === createdWorktree.id
                      ? { ...worktree, ...createdWorktree }
                      : worktree
                  )
                : [...current, createdWorktree]
              return {
                worktreesByRepo: {
                  ...s.worktreesByRepo,
                  [repoId]: nextWorktrees
                },
                ...(result.workspaceLineage
                  ? {
                      workspaceLineageByChildKey: {
                        ...s.workspaceLineageByChildKey,
                        [result.workspaceLineage.childWorkspaceKey]: result.workspaceLineage
                      }
                    }
                  : {}),
                ...(result.initialBaseStatus
                  ? {
                      baseStatusByWorktreeId: {
                        ...s.baseStatusByWorktreeId,
                        [result.worktree.id]:
                          s.baseStatusByWorktreeId[result.worktree.id] ?? result.initialBaseStatus
                      }
                    }
                  : {}),
                sortEpoch: s.sortEpoch + 1
              }
            })
            publishLocalBaseRefRefreshResult(result.localBaseRefRefresh)
            if (result.localBaseRefUpdateSuggestion) {
              publishRendererCommandResult({
                type: 'worktree-local-base-ref-suggestion',
                suggestion: result.localBaseRefUpdateSuggestion
              })
            }
            return result
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const shouldRetry = isRetryableWorktreeCreateConflict(message)
            if (!shouldRetry || attempt === CLIENT_WORKTREE_CREATE_MAX_ATTEMPTS - 1) {
              throw error
            }
          }
        }

        throw new Error('Failed to create worktree after retrying branch conflicts.')
      } catch (err) {
        console.error('Failed to create worktree:', err)
        throw err
      }
    }
  }
}
