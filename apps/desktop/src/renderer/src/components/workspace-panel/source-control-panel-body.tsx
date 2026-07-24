import { BulkActionBar } from './bulk-action-bar'
import { SourceControlBranchSection } from './source-control-branch-section'
import { CompareUnavailable } from './source-control-compare-summary'
import type { SourceControlController } from './source-control-controller'
import { shouldShowSourceControlCompareUnavailableCard } from './source-control-header-toolbar'
import { SourceControlHistorySection } from './source-control-history-section'
import { SourceControlPanelCommit } from './source-control-panel-commit'
import { SourceControlPanelStatus } from './source-control-panel-status'
import { SourceControlUncommittedSections } from './source-control-uncommitted-sections'

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
          <SourceControlUncommittedSections controller={controller} />
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
        <SourceControlBranchSection controller={controller} />
        <SourceControlHistorySection controller={controller} />
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
