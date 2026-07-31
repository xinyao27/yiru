import { translate } from '../../../i18n/i18n'
import { AccordionContent, AccordionItem } from '../../ui/accordion'
import { Button } from '../../ui/button'
import { BranchEntryRow } from './branch-entry-row'
import type { SourceControlController } from './controller'
import { SourceControlPierreBranchTree } from './pierre-tree'
import { SourceControlAccordionSectionHeader as SectionHeader } from './section-header'
import { SourceControlVirtualFileList } from './virtual-file-list'

type SourceControlBranchSectionProps = {
  controller: SourceControlController
}

type VisibleSourceControlBranchSectionController = SourceControlController & {
  activeWorktree: NonNullable<SourceControlController['activeWorktree']>
  branchSummary: Extract<NonNullable<SourceControlController['branchSummary']>, { status: 'ready' }>
  worktreePath: string
}

export function isSourceControlBranchSectionVisible(
  controller: SourceControlController
): controller is VisibleSourceControlBranchSectionController {
  return Boolean(
    controller.branchSummary?.status === 'ready' &&
    controller.filteredBranchEntries.length > 0 &&
    controller.activeWorktree &&
    controller.worktreePath
  )
}

export function SourceControlBranchSection({
  controller
}: SourceControlBranchSectionProps): React.JSX.Element | null {
  if (!isSourceControlBranchSectionVisible(controller)) {
    return null
  }

  const {
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    branchSummary,
    diffCommentCountByPath,
    fileListScrollElement,
    filteredBranchEntries,
    openBranchAllDiffs,
    openCommittedDiff,
    revealInExplorer,
    sourceControlViewMode,
    workspacePanelTabId,
    worktreePath
  } = controller

  const currentWorktreeId = activeWorktree.id
  return (
    <AccordionItem value="branch" bordered={false}>
      <SectionHeader
        label={translate(
          'auto.components.right.sidebar.SourceControl.d7ae61269b',
          'Committed on Branch'
        )}
        count={filteredBranchEntries.length}
        actions={
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-auto px-1.5 py-0.5 text-xs"
            onClick={(event) => {
              event.stopPropagation()
              if (activeWorktreeId) {
                openBranchAllDiffs(activeWorktreeId, worktreePath, branchSummary, undefined, {
                  workspacePanelTabId
                })
              }
            }}
          >
            {translate('auto.components.right.sidebar.SourceControl.48db37cca9', 'View all')}
          </Button>
        }
      />
      <AccordionContent padding="none">
        {sourceControlViewMode === 'tree' ? (
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
      </AccordionContent>
    </AccordionItem>
  )
}
