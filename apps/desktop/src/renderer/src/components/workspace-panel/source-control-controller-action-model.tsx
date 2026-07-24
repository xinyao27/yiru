import { useMemo } from 'react'

import { translate } from '@/i18n/i18n'

import { isStageableStatusEntry } from './discard-all-sequence'
import type { SourceControlCreateReviewIntentController } from './source-control-controller-create-review-intent'
import { resolveVisibleCreatePrHeaderAction } from './source-control-create-pr-intent-state'
import { resolveDropdownItems, type DropdownEntry } from './source-control-dropdown-items'
import { resolveCommitAreaPrimaryAction, type PrimaryAction } from './source-control-primary-action'
import { resolveCreatePrHeaderAction } from './source-control-primary-create-pr-intent-action'

export function useSourceControlActionModel(scope: SourceControlCreateReviewIntentController) {
  const {
    branchName,
    branchSummary,
    canUseHostedReviewPushTarget,
    commitMessage,
    conflictOperation,
    effectiveBaseRef,
    grouped,
    hostedReview,
    hostedReviewCreateCopy,
    hostedReviewCreation,
    hostedReviewCreationForHeader,
    hostedReviewStateForActions,
    inFlightRemoteOpKind,
    isAbortingOperation,
    isCommitting,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isHostedReviewCreationLoading,
    isHostedReviewStateLoading,
    isRemoteOperationActive,
    prGenerating,
    remoteStatus,
    remoteStatusForActions,
    unresolvedConflicts
  } = scope
  const hasUnstagedChanges = grouped.unstaged.length > 0 || grouped.untracked.length > 0
  const hasStageableChanges = useMemo(
    () =>
      grouped.unstaged.some(isStageableStatusEntry) ||
      grouped.untracked.some(isStageableStatusEntry),
    [grouped.unstaged, grouped.untracked]
  )
  const hasPartiallyStagedChanges = useMemo(() => {
    if (grouped.staged.length === 0 || grouped.unstaged.length === 0) {
      return false
    }
    const unstagedPaths = new Set(grouped.unstaged.map((entry) => entry.path))
    return grouped.staged.some((entry) => unstagedPaths.has(entry.path))
  }, [grouped.staged, grouped.unstaged])
  const primaryAction: PrimaryAction = useMemo(() => {
    return resolveCommitAreaPrimaryAction({
      stagedCount: grouped.staged.length,
      hasUnstagedChanges,
      hasStageableChanges,
      hasPartiallyStagedChanges,
      hasMessage: commitMessage.trim().length > 0,
      hasUnresolvedConflicts: unresolvedConflicts.length > 0,
      isCommitting,
      isRemoteOperationActive: isRemoteOperationActive || isAbortingOperation,
      upstreamStatus: remoteStatusForActions,
      prState: hostedReviewStateForActions,
      isPRStateLoading: isHostedReviewStateLoading,
      inFlightRemoteOpKind,
      hostedReviewCreation,
      branchCommitsAhead:
        branchSummary?.status === 'ready' ? (branchSummary.commitsAhead ?? 0) : undefined,
      hasCurrentBranch: Boolean(branchName),
      canPushLinkedReviewWithoutUpstream: canUseHostedReviewPushTarget,
      isPrIntentInFlight: isCreatePrIntentInFlight
    })
  }, [
    commitMessage,
    grouped.staged.length,
    hasStageableChanges,
    hasUnstagedChanges,
    hasPartiallyStagedChanges,
    isCommitting,
    isAbortingOperation,
    isRemoteOperationActive,
    inFlightRemoteOpKind,
    hostedReviewCreation,
    isHostedReviewStateLoading,
    hostedReviewStateForActions,
    canUseHostedReviewPushTarget,
    isCreatePrIntentInFlight,
    branchSummary?.commitsAhead,
    branchSummary?.status,
    branchName,
    remoteStatusForActions,
    unresolvedConflicts.length
  ])
  const createPrHeaderAction: PrimaryAction | null = useMemo(() => {
    const action = resolveCreatePrHeaderAction({
      stagedCount: grouped.staged.length,
      hasUnstagedChanges,
      hasStageableChanges,
      hasPartiallyStagedChanges,
      hasMessage: commitMessage.trim().length > 0,
      hasUnresolvedConflicts: unresolvedConflicts.length > 0,
      isCommitting,
      isRemoteOperationActive: isRemoteOperationActive || isAbortingOperation,
      upstreamStatus: remoteStatus,
      prState: hostedReview?.state ?? null,
      isPRStateLoading: isHostedReviewStateLoading,
      inFlightRemoteOpKind,
      hostedReviewCreation: hostedReviewCreationForHeader,
      isHostedReviewCreationLoading:
        isHostedReviewCreationLoading && hostedReviewCreationForHeader !== null,
      branchCommitsAhead:
        branchSummary?.status === 'ready' ? (branchSummary.commitsAhead ?? 0) : undefined,
      hasCurrentBranch: Boolean(branchName),
      isPrIntentInFlight: isCreatePrIntentInFlight
    })
    if ((prGenerating || isCreatingPr) && action?.kind === 'create_pr') {
      return {
        ...action,
        title: prGenerating
          ? translate(
              'auto.components.right.sidebar.SourceControl.createPrIntentGeneratingDetails',
              'Generating review details…'
            )
          : translate(
              'auto.components.right.sidebar.SourceControl.fe5bd1a610',
              'Creating {{value0}}...',
              { value0: hostedReviewCreateCopy.reviewLabel }
            ),
        disabled: true
      }
    }
    return action
  }, [
    branchName,
    branchSummary?.commitsAhead,
    branchSummary?.status,
    commitMessage,
    grouped.staged.length,
    hasPartiallyStagedChanges,
    hasStageableChanges,
    hasUnstagedChanges,
    hostedReview?.state,
    hostedReviewCreationForHeader,
    hostedReviewCreateCopy.reviewLabel,
    inFlightRemoteOpKind,
    isAbortingOperation,
    isCommitting,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isHostedReviewCreationLoading,
    isHostedReviewStateLoading,
    isRemoteOperationActive,
    prGenerating,
    remoteStatus,
    unresolvedConflicts.length
  ])
  const directCreatePrAction =
    createPrHeaderAction?.kind === 'create_pr' &&
    hostedReviewCreation?.canCreate === true &&
    (!createPrHeaderAction.disabled || isCreatingPr || prGenerating)
      ? createPrHeaderAction
      : null
  const visibleCreatePrHeaderAction = resolveVisibleCreatePrHeaderAction({
    createPrHeaderAction
  })
  const dropdownItems: DropdownEntry[] = useMemo(
    () =>
      resolveDropdownItems({
        stagedCount: grouped.staged.length,
        hasUnstagedChanges,
        hasStageableChanges,
        hasPartiallyStagedChanges,
        hasMessage: commitMessage.trim().length > 0,
        hasUnresolvedConflicts: unresolvedConflicts.length > 0,
        isCommitting,
        isRemoteOperationActive: isRemoteOperationActive || isAbortingOperation,
        conflictOperation,
        upstreamStatus: remoteStatusForActions,
        prState: hostedReviewStateForActions,
        isPRStateLoading: isHostedReviewStateLoading,
        inFlightRemoteOpKind,
        hostedReviewCreation,
        isPullRequestOperationActive: prGenerating || isCreatingPr || isCreatePrIntentInFlight,
        branchCommitsAhead:
          branchSummary?.status === 'ready' ? (branchSummary.commitsAhead ?? 0) : undefined,
        hasCurrentBranch: Boolean(branchName),
        canPushLinkedReviewWithoutUpstream: canUseHostedReviewPushTarget,
        rebaseBaseRef: effectiveBaseRef
      }),
    [
      commitMessage,
      grouped.staged.length,
      hasStageableChanges,
      hasUnstagedChanges,
      hasPartiallyStagedChanges,
      isCommitting,
      conflictOperation,
      isAbortingOperation,
      isRemoteOperationActive,
      inFlightRemoteOpKind,
      hostedReviewCreation,
      isCreatingPr,
      isCreatePrIntentInFlight,
      isHostedReviewStateLoading,
      hostedReviewStateForActions,
      prGenerating,
      canUseHostedReviewPushTarget,
      branchSummary?.commitsAhead,
      branchSummary?.status,
      branchName,
      effectiveBaseRef,
      remoteStatusForActions,
      unresolvedConflicts.length
    ]
  )
  return {
    ...scope,
    hasUnstagedChanges,
    hasStageableChanges,
    hasPartiallyStagedChanges,
    primaryAction,
    createPrHeaderAction,
    directCreatePrAction,
    visibleCreatePrHeaderAction,
    dropdownItems
  }
}

export type SourceControlActionModelController = ReturnType<typeof useSourceControlActionModel>
