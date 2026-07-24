import {
  resolveSourceControlOperationFollowUp,
  type SourceControlRemoteOperationOutcome,
  type SourceControlRemoteOpKind
} from '@yiru/workbench-model/review'

import { fetchRuntimeGit } from '@/runtime/runtime-git-client'

import { resolveSourceControlOperationOwner } from '../../../../shared/source-control-operation-owner'
import type { GitPushTarget, GlobalSettings } from '../../../../shared/types'
import type { AppState } from '../types'

export type RemoteOperationFollowUpArgs = {
  operation: SourceControlRemoteOpKind
  outcome: SourceControlRemoteOperationOutcome
  worktreeId: string
  worktreePath: string
  connectionId?: string | null
  pushTarget?: GitPushTarget
  runtimeSettings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
  syncPushed?: boolean
}

export function applyRemoteOperationFollowUp(
  get: () => AppState,
  args: RemoteOperationFollowUpArgs
): void {
  const followUp = resolveSourceControlOperationFollowUp({
    operation: args.operation,
    outcome: args.outcome,
    syncPushed: args.syncPushed
  })
  const runtimeContext = {
    settings: args.runtimeSettings,
    worktreeId: args.worktreeId,
    worktreePath: args.worktreePath,
    connectionId: args.connectionId ?? undefined
  }
  const refreshUpstream = () =>
    get().fetchUpstreamStatus(
      args.worktreeId,
      args.worktreePath,
      args.connectionId ?? undefined,
      args.pushTarget,
      { runtimeTargetSettings: args.runtimeSettings }
    )

  if (followUp.recovery === 'fetch_then_refresh_upstream') {
    // Why: a rejected push proves the remote moved. Fetch on the same native,
    // WSL, or SSH runtime before refreshing counts so Pull/Sync is actionable.
    void fetchRuntimeGit(runtimeContext, args.pushTarget)
      .catch(() => undefined)
      .then(refreshUpstream)
    return
  }
  if (followUp.statusRefresh) {
    void refreshUpstream()
  }
  if (followUp.refreshHostedReview) {
    refreshHostedReviewAfterRemoteOperation(get(), args)
  }
}

function refreshHostedReviewAfterRemoteOperation(
  state: AppState,
  args: Pick<
    RemoteOperationFollowUpArgs,
    'worktreeId' | 'worktreePath' | 'connectionId' | 'runtimeSettings'
  >
): void {
  const owner = resolveSourceControlOperationOwner(state, args)
  if (!owner) {
    return
  }
  const { worktree, repo, executionHostId } = owner
  if (worktree.branch && typeof state.fetchHostedReviewForBranch === 'function') {
    void state.fetchHostedReviewForBranch(repo.path, worktree.branch, {
      force: true,
      repoId: repo.id,
      executionHostId,
      linkedGitHubPR: worktree.linkedPR,
      linkedGitLabMR: worktree.linkedGitLabMR ?? null,
      linkedBitbucketPR: worktree.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: worktree.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: worktree.linkedGiteaPR ?? null
    })
  }
  // GitHub's richer cache also owns checks/review details beyond the neutral card.
  if (typeof state.refreshGitHubForWorktree === 'function') {
    state.refreshGitHubForWorktree(args.worktreeId, executionHostId)
  }
}
