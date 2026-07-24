import { useEffect, useMemo } from 'react'

import type { SourceControlStatusRefreshController } from './source-control-controller-status-refresh'
import {
  hasPositiveHostedReviewNumberLink,
  hasResolvableHostedReviewPushTargetLink,
  hasUsableHostedReviewPushTarget,
  resolveHostedReviewActionUpstreamStatus,
  resolveHostedReviewStateForActions
} from './source-control-hosted-review-push-target'
import { buildSourceControlManualReviewUrlFromContext } from './source-control-manual-review-url'
import {
  buildLoadingHostedReviewCreationEligibility,
  resolveProvisionalHostedReviewProvider
} from './source-control-primary-create-pr-intent-action'

export function useSourceControlHostedReviewState(scope: SourceControlStatusRefreshController) {
  const {
    activeRepo,
    activeWorktree,
    activeWorktreeId,
    branchName,
    compareBaseRef,
    ensureHostedReviewPushTarget,
    fallbackGitHubPRNumber,
    hostedReview,
    hostedReviewCreation,
    hostedReviewCreationProviderHintRef,
    hostedReviewCreationRequestState,
    hostedReviewEntry,
    isBranchVisible,
    isFolder,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitHubPR,
    linkedGitLabMR,
    linkedGiteaPR,
    remoteStatus
  } = scope
  const manualReviewUrl = useMemo(
    () =>
      buildSourceControlManualReviewUrlFromContext({
        hostedReviewProvider: hostedReview?.provider ?? null,
        hostedReviewCreationProvider: hostedReviewCreation?.provider ?? null,
        linkedGitHubPR,
        fallbackGitHubPRNumber,
        linkedGitLabMR,
        linkedBitbucketPR,
        linkedAzureDevOpsPR,
        linkedGiteaPR,
        baseRef: compareBaseRef,
        branchName,
        repoRemoteName: activeRepo?.gitRemoteIdentity?.remoteName ?? null,
        repoRemoteUrl: activeRepo?.gitRemoteIdentity?.remoteUrl ?? null,
        pushTarget: activeWorktree?.pushTarget ?? null,
        upstreamName: remoteStatus?.upstreamName ?? null
      }),
    [
      activeRepo?.gitRemoteIdentity?.remoteName,
      activeRepo?.gitRemoteIdentity?.remoteUrl,
      activeWorktree?.pushTarget,
      branchName,
      compareBaseRef,
      fallbackGitHubPRNumber,
      hostedReview?.provider,
      hostedReviewCreation?.provider,
      linkedAzureDevOpsPR,
      linkedBitbucketPR,
      linkedGitHubPR,
      linkedGitLabMR,
      linkedGiteaPR,
      remoteStatus?.upstreamName
    ]
  )
  const shouldResolveHostedReviewCreation =
    isBranchVisible &&
    Boolean(activeRepo) &&
    !isFolder &&
    Boolean(branchName) &&
    branchName !== 'HEAD' &&
    Boolean(activeWorktreeId)
  const hostedReviewCreationRequestMatchesCurrent =
    hostedReviewCreationRequestState !== null &&
    activeRepo?.id === hostedReviewCreationRequestState.repoId &&
    activeWorktreeId === hostedReviewCreationRequestState.worktreeId &&
    branchName === hostedReviewCreationRequestState.branch
  const isHostedReviewCreationLoading =
    shouldResolveHostedReviewCreation &&
    hostedReviewCreationRequestMatchesCurrent &&
    hostedReviewCreationRequestState.status === 'loading' &&
    hostedReview === null
  const provisionalHostedReviewProvider = useMemo(
    () =>
      resolveProvisionalHostedReviewProvider({
        hostedReview,
        hostedReviewCreationState: hostedReviewCreation
          ? {
              repoId: activeRepo?.id ?? '',
              data: hostedReviewCreation
            }
          : null,
        activeRepoId: activeRepo?.id ?? null,
        linkedGitHubPR,
        fallbackGitHubPR: fallbackGitHubPRNumber,
        linkedGitLabMR,
        linkedBitbucketPR,
        linkedAzureDevOpsPR,
        linkedGiteaPR
      }),
    [
      activeRepo?.id,
      fallbackGitHubPRNumber,
      hostedReview,
      hostedReviewCreation,
      linkedAzureDevOpsPR,
      linkedBitbucketPR,
      linkedGitHubPR,
      linkedGitLabMR,
      linkedGiteaPR
    ]
  )
  useEffect(() => {
    const hasConcreteProviderHint =
      hostedReview !== null ||
      hostedReviewCreation !== null ||
      linkedGitHubPR !== null ||
      fallbackGitHubPRNumber !== null ||
      linkedGitLabMR !== null ||
      linkedAzureDevOpsPR !== null ||
      linkedGiteaPR !== null

    if (!hasConcreteProviderHint) {
      return
    }

    hostedReviewCreationProviderHintRef.current = {
      repoId: activeRepo?.id ?? null,
      worktreeId: activeWorktreeId ?? null,
      branch: branchName,
      provider: provisionalHostedReviewProvider
    }
  }, [
    activeRepo?.id,
    activeWorktreeId,
    branchName,
    fallbackGitHubPRNumber,
    hostedReview,
    hostedReviewCreation,
    hostedReviewCreationProviderHintRef,
    linkedAzureDevOpsPR,
    linkedGiteaPR,
    linkedGitHubPR,
    linkedGitLabMR,
    provisionalHostedReviewProvider
  ])
  const hostedReviewCreationForHeader = useMemo(() => {
    // Why: disable stale eligibility during preflight while retaining provider
    // copy from the previous safe snapshot.
    if (isHostedReviewCreationLoading) {
      const providerHint = hostedReviewCreationProviderHintRef.current
      const provider =
        providerHint.repoId === (activeRepo?.id ?? null) &&
        providerHint.worktreeId === (activeWorktreeId ?? null) &&
        providerHint.branch === branchName
          ? providerHint.provider
          : provisionalHostedReviewProvider
      return buildLoadingHostedReviewCreationEligibility(provider)
    }
    return hostedReviewCreation
  }, [
    activeRepo?.id,
    activeWorktreeId,
    branchName,
    hostedReviewCreation,
    hostedReviewCreationProviderHintRef,
    isHostedReviewCreationLoading,
    provisionalHostedReviewProvider
  ])
  const hasHostedReviewLink = hasPositiveHostedReviewNumberLink({
    linkedGitHubPR,
    fallbackGitHubPR: fallbackGitHubPRNumber,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR
  })
  const isHostedReviewStateLoading =
    !activeRepo?.connectionId && hasHostedReviewLink && hostedReviewEntry === undefined
  const hasResolvableReviewPushTargetLink = hasResolvableHostedReviewPushTargetLink({
    linkedGitHubPR,
    fallbackGitHubPR: fallbackGitHubPRNumber,
    linkedGitLabMR
  })
  useEffect(() => {
    // Why: resolving review heads can hit provider/SSH APIs, so keep it tied
    // to the visible Source Control branch view like the adjacent PR polling.
    if (!isBranchVisible || isFolder || !activeWorktreeId || activeWorktree?.pushTarget) {
      return
    }
    if (!hasResolvableReviewPushTargetLink) {
      return
    }
    void ensureHostedReviewPushTarget(activeWorktreeId)
  }, [
    activeWorktree?.pushTarget,
    activeWorktreeId,
    ensureHostedReviewPushTarget,
    hasResolvableReviewPushTargetLink,
    isBranchVisible,
    isFolder
  ])
  const canUseHostedReviewPushTarget = hasUsableHostedReviewPushTarget({
    pushTarget: activeWorktree?.pushTarget,
    upstreamStatus: remoteStatus,
    hasResolvableHostedReviewPushTargetLink: hasResolvableReviewPushTargetLink,
    branchName
  })
  const hostedReviewStateForActions = resolveHostedReviewStateForActions({
    hostedReviewState: hostedReview?.state ?? null,
    hasResolvableHostedReviewPushTargetLink: hasResolvableReviewPushTargetLink
  })
  const remoteStatusForActions: typeof remoteStatus = useMemo(
    () =>
      resolveHostedReviewActionUpstreamStatus({
        hasHostedReviewLink,
        hasResolvableHostedReviewPushTargetLink: hasResolvableReviewPushTargetLink,
        hostedReviewState: hostedReviewStateForActions,
        isHostedReviewStateLoading,
        canUseHostedReviewPushTarget,
        upstreamStatus: remoteStatus
      }),
    [
      canUseHostedReviewPushTarget,
      hasHostedReviewLink,
      hasResolvableReviewPushTargetLink,
      hostedReviewStateForActions,
      isHostedReviewStateLoading,
      remoteStatus
    ]
  )
  return {
    ...scope,
    manualReviewUrl,
    shouldResolveHostedReviewCreation,
    hostedReviewCreationRequestMatchesCurrent,
    isHostedReviewCreationLoading,
    provisionalHostedReviewProvider,
    hostedReviewCreationForHeader,
    hasHostedReviewLink,
    isHostedReviewStateLoading,
    hasResolvableReviewPushTargetLink,
    canUseHostedReviewPushTarget,
    hostedReviewStateForActions,
    remoteStatusForActions
  }
}

export type SourceControlHostedReviewStateController = ReturnType<
  typeof useSourceControlHostedReviewState
>
