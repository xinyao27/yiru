import { translate } from '../../../i18n/i18n'
import { Button } from '../../ui/button'
import { BranchEntryRow } from './branch-entry-row'
import type { SourceControlController } from './controller'
import { SourceControlPierreBranchTree } from './pierre-tree'
import { SourceControlSectionHeader as SectionHeader } from './section-header'
import { SourceControlVirtualFileList } from './virtual-file-list'

type SourceControlBranchSectionProps = {
  controller: SourceControlController
}

export function SourceControlBranchSection({
  controller
}: SourceControlBranchSectionProps): React.JSX.Element | null {
  const {
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    branchSummary,
    collapsedSections,
    diffCommentCountByPath,
    fileListScrollElement,
    filteredBranchEntries,
    openBranchAllDiffs,
    openCommittedDiff,
    revealInExplorer,
    sourceControlViewMode,
    toggleSection,
    worktreePath
  } = controller

  if (
    branchSummary?.status !== 'ready' ||
    filteredBranchEntries.length === 0 ||
    !activeWorktree ||
    !worktreePath
  ) {
    return null
  }

  const isCollapsed = collapsedSections.has('branch')
  const currentWorktreeId = activeWorktree.id
  return (
    <div>
      <SectionHeader
        label={translate(
          'auto.components.right.sidebar.SourceControl.d7ae61269b',
          'Committed on Branch'
        )}
        count={filteredBranchEntries.length}
        isCollapsed={isCollapsed}
        onToggle={() => toggleSection('branch')}
        actions={
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-auto px-1.5 py-0.5 text-xs"
            onClick={(event) => {
              event.stopPropagation()
              if (activeWorktreeId) {
                openBranchAllDiffs(activeWorktreeId, worktreePath, branchSummary)
              }
            }}
          >
            {translate('auto.components.right.sidebar.SourceControl.48db37cca9', 'View all')}
          </Button>
        }
      />
      {isCollapsed ? null : sourceControlViewMode === 'tree' ? (
        <SourceControlPierreBranchTree controller={controller} />
      ) : (
        <SourceControlVirtualFileList
          rows={filteredBranchEntries}
          scrollElement={fileListScrollElement}
          getRowKey={(entry) => `branch:${entry.path}`}
          renderRow={(entry) => (
            <BranchEntryRow
              key={`branch:${entry.path}`}
              entry={entry}
              currentWorktreeId={currentWorktreeId}
              worktreePath={worktreePath}
              onRevealInExplorer={revealInExplorer}
              connectionId={activeConnectionId}
              onOpen={(event) => openCommittedDiff(entry, event)}
              commentCount={diffCommentCountByPath.get(entry.path) ?? 0}
            />
          )}
        />
      )}
    </div>
  )
}
