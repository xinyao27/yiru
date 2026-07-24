import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

import { BranchEntryRow } from './source-control-branch-entry-row'
import type { SourceControlController } from './source-control-controller'
import { SourceControlBranchTreeDirectoryRow } from './source-control-directory-rows'
import { SourceControlSectionHeader as SectionHeader } from './source-control-section-header'
import { SourceControlVirtualFileList } from './source-control-virtual-file-list'

export function SourceControlBranchSection({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element | null {
  const {
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    branchSummary,
    collapsedSections,
    collapsedTreeDirs,
    diffCommentCountByPath,
    fileListScrollElement,
    filteredBranchEntries,
    openBranchAllDiffs,
    openCommittedDiff,
    revealInExplorer,
    sourceControlViewMode,
    toggleSection,
    toggleTreeDir,
    visibleBranchTreeRows,
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
        <SourceControlVirtualFileList
          rows={visibleBranchTreeRows}
          scrollElement={fileListScrollElement}
          getRowKey={(node) => node.key}
          renderRow={(node) =>
            node.type === 'directory' ? (
              <SourceControlBranchTreeDirectoryRow
                key={node.key}
                node={node}
                isCollapsed={collapsedTreeDirs.has(node.key)}
                onToggle={() => toggleTreeDir(node.key)}
              />
            ) : (
              <BranchEntryRow
                key={node.key}
                entry={node.entry}
                currentWorktreeId={currentWorktreeId}
                worktreePath={worktreePath}
                depth={node.depth}
                onRevealInExplorer={revealInExplorer}
                connectionId={activeConnectionId}
                onOpen={(event) => openCommittedDiff(node.entry, event)}
                commentCount={diffCommentCountByPath.get(node.entry.path) ?? 0}
                showPathHint={false}
              />
            )
          }
        />
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
