import { Accordion } from '../../ui/accordion'
import { ScrollArea } from '../../ui/scroll-area'
import { isSourceControlBranchSectionVisible, SourceControlBranchSection } from './branch-section'
import { CompareUnavailable } from './compare-summary'
import type { SourceControlController } from './controller'
import { shouldShowSourceControlCompareUnavailableCard } from './header-toolbar'
import { SourceControlHistorySectionMemo } from './history-section'
import { SourceControlPanelCommit } from './panel-commit'
import { SourceControlPanelStatus } from './panel-status'
import type { SourceControlDisplaySectionId } from './section-order'
import { SourceControlUncommittedSectionsMemo } from './uncommitted-sections'

type SourceControlAccordionSectionId = SourceControlDisplaySectionId | 'branch'

export function SourceControlPanelBody({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const {
    branchEntries,
    branchSummary,
    collapsedSections,
    displaySections,
    filteredBranchEntries,
    filteredGrouped,
    hasUncommittedEntries,
    normalizedFilter,
    refreshBranchCompare,
    setBaseRefDialogOpen,
    setFileListScrollElement,
    toggleSection
  } = controller
  const hasFilteredUncommittedEntries =
    filteredGrouped.staged.length > 0 ||
    filteredGrouped.unstaged.length > 0 ||
    filteredGrouped.untracked.length > 0
  const hasFilteredBranchEntries = filteredBranchEntries.length > 0
  const showGenericEmptyState =
    !hasUncommittedEntries && branchSummary?.status === 'ready' && branchEntries.length === 0
  const sectionIds: SourceControlAccordionSectionId[] = displaySections.map((section) => section.id)
  if (isSourceControlBranchSectionVisible(controller)) {
    sectionIds.push('branch')
  }
  const expandedSectionIds = sectionIds.filter((sectionId) => !collapsedSections.has(sectionId))

  const handleExpandedSectionsChange = (nextExpandedSectionIds: string[]): void => {
    const nextExpandedSections = new Set(nextExpandedSectionIds)
    for (const sectionId of sectionIds) {
      if (nextExpandedSections.has(sectionId) === collapsedSections.has(sectionId)) {
        toggleSection(sectionId)
      }
    }
  }

  return (
    <ScrollArea
      className="min-h-0 flex-1"
      viewportClassName="flex flex-col overflow-x-hidden pt-1"
      viewportRef={setFileListScrollElement}
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
      <Accordion multiple value={expandedSectionIds} onValueChange={handleExpandedSectionsChange}>
        {hasFilteredUncommittedEntries ? (
          <SourceControlUncommittedSectionsMemo controller={controller} />
        ) : null}
        <SourceControlBranchSection controller={controller} />
      </Accordion>
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
      <SourceControlHistorySectionMemo controller={controller} />
    </ScrollArea>
  )
}
