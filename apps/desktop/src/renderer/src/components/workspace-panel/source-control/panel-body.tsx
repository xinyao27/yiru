import { BulkActionBar } from '../bulk-action-bar'
import { SourceControlBranchSectionMemo } from './branch-section'
import { CompareUnavailable } from './compare-summary'
import type { SourceControlController } from './controller'
import { shouldShowSourceControlCompareUnavailableCard } from './header-toolbar'
import { SourceControlHistorySectionMemo } from './history-section'
import { SourceControlPanelCommit } from './panel-commit'
import { SourceControlPanelStatus } from './panel-status'
import { SourceControlUncommittedSectionsMemo } from './uncommitted-sections'

export function SourceControlPanelBody({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const {
    branchEntries,
    branchSummary,
    bulkStagePaths,
    bulkUnstagePaths,
    clearSelection,
    filteredBranchEntries,
    filteredGrouped,
    handleBulkStage,
    handleBulkUnstage,
    hasUncommittedEntries,
    isExecutingBulk,
    normalizedFilter,
    refreshBranchCompare,
    selectedKeys,
    setBaseRefDialogOpen,
    setFileListScrollElement
  } = controller
  const hasFilteredUncommittedEntries =
    filteredGrouped.staged.length > 0 ||
    filteredGrouped.unstaged.length > 0 ||
    filteredGrouped.untracked.length > 0
  const hasFilteredBranchEntries = filteredBranchEntries.length > 0
  const showGenericEmptyState =
    !hasUncommittedEntries && branchSummary?.status === 'ready' && branchEntries.length === 0

  return (
    <>
      <div
        ref={setFileListScrollElement}
        className="scrollbar-sleek relative flex flex-1 flex-col overflow-auto pt-1"
        style={{ paddingBottom: selectedKeys.size > 0 ? 50 : undefined }}
      >
        <SourceControlPanelStatus
          controller={controller}
          hasFilteredBranchEntries={hasFilteredBranchEntries}
          hasFilteredUncommittedEntries={hasFilteredUncommittedEntries}
          showGenericEmptyState={showGenericEmptyState}
        />
        <SourceControlPanelCommit
          controller={controller}
          showGenericEmptyState={showGenericEmptyState}
        />
        {hasFilteredUncommittedEntries ? (
          <SourceControlUncommittedSectionsMemo controller={controller} />
        ) : null}
        {shouldShowSourceControlCompareUnavailableCard(
          branchSummary,
          hasUncommittedEntries,
          branchEntries.length > 0,
          Boolean(normalizedFilter)
        ) && branchSummary ? (
          <CompareUnavailable
            summary={branchSummary}
            onChangeBaseRef={() => setBaseRefDialogOpen(true)}
            onRetry={() => void refreshBranchCompare()}
          />
        ) : null}
        <SourceControlBranchSectionMemo controller={controller} />
        <SourceControlHistorySectionMemo controller={controller} />
      </div>

      {selectedKeys.size > 0 ? (
        <BulkActionBar
          selectedCount={selectedKeys.size}
          stageableCount={bulkStagePaths.length}
          unstageableCount={bulkUnstagePaths.length}
          onStage={handleBulkStage}
          onUnstage={handleBulkUnstage}
          onClear={clearSelection}
          isExecuting={isExecutingBulk}
        />
      ) : null}
    </>
  )
}
