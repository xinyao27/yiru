import {
  ConflictSummaryCard,
  OperationBanner,
  TooManyChangesBanner
} from './source-control-conflict-summary'
import type { SourceControlController } from './source-control-controller'
import { EmptyState } from './source-control-empty-state'

export function SourceControlPanelStatus({
  controller,
  hasFilteredBranchEntries,
  hasFilteredUncommittedEntries,
  showGenericEmptyState
}: {
  controller: SourceControlController
  hasFilteredBranchEntries: boolean
  hasFilteredUncommittedEntries: boolean
  showGenericEmptyState: boolean
}): React.JSX.Element {
  const {
    activeWorktreeId,
    branchSummary,
    conflictOperation,
    fileFilterState,
    filterQuery,
    handleAbortOperationForConflict,
    handleResolveConflictsWithAI,
    isAbortingOperation,
    normalizedFilter,
    openConflictReview,
    repositoryHuge,
    sourceControlAiActionsVisible,
    unresolvedConflictReviewEntries,
    worktreePath
  } = controller

  return (
    <>
      {unresolvedConflictReviewEntries.length > 0 ? (
        <div className="px-3 pb-2">
          <ConflictSummaryCard
            conflictOperation={conflictOperation}
            unresolvedCount={unresolvedConflictReviewEntries.length}
            sourceControlAiActionsVisible={sourceControlAiActionsVisible}
            isResolvingWithAI={false}
            isAbortingOperation={isAbortingOperation}
            onAbortOperation={handleAbortOperationForConflict}
            onResolveWithAI={() => void handleResolveConflictsWithAI()}
            onReview={() => {
              if (activeWorktreeId && worktreePath) {
                openConflictReview(
                  activeWorktreeId,
                  worktreePath,
                  unresolvedConflictReviewEntries,
                  'live-summary'
                )
              }
            }}
          />
        </div>
      ) : null}

      {/* Why: the conflict card owns active conflicts; this covers the between-step state. */}
      {unresolvedConflictReviewEntries.length === 0 && conflictOperation !== 'unknown' ? (
        <div className="px-3 pb-2">
          <OperationBanner
            conflictOperation={conflictOperation}
            isAbortingOperation={isAbortingOperation}
            onAbortOperation={handleAbortOperationForConflict}
          />
        </div>
      ) : null}

      {repositoryHuge ? (
        <div className="px-3 pb-2">
          <TooManyChangesBanner limit={repositoryHuge.limit} />
        </div>
      ) : null}

      {showGenericEmptyState && !normalizedFilter ? (
        <EmptyState
          heading="No changes on this branch"
          supportingText={`This workspace is clean and this branch has no changes ahead of ${branchSummary?.baseRef ?? 'base'}`}
        />
      ) : null}

      {fileFilterState.tooLarge ? (
        <EmptyState
          heading="Search text is too large"
          supportingText="Use a shorter file filter."
        />
      ) : null}

      {normalizedFilter && !hasFilteredUncommittedEntries && !hasFilteredBranchEntries ? (
        <EmptyState
          heading="No matching files"
          supportingText={`No changed files match "${filterQuery}"`}
        />
      ) : null}
    </>
  )
}
