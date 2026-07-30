import type { SourceControlController } from './controller'
import { SubmodulePlaceholderRow } from './entry-details'
import { SourceControlPierreUncommittedTree } from './pierre-tree'
import type { SourceControlDisplaySectionId } from './section-order'
import { getSubmoduleExpansionKey, isExpandableSubmoduleEntry } from './submodule-expansion'
import { UncommittedEntryRow } from './uncommitted-entry-row'
import { SourceControlVirtualFileList } from './virtual-file-list'

export function SourceControlUncommittedFileList({
  controller,
  sectionId
}: {
  controller: SourceControlController
  sectionId: SourceControlDisplaySectionId
}): React.JSX.Element | null {
  const {
    activeConnectionId,
    activeOpenRowKeys,
    activeWorktree,
    diffCommentCountByPath,
    expandedSubmoduleKeys,
    fileListScrollElement,
    handleOpenDiff,
    handleStage,
    handleUnstage,
    requestDiscardEntry,
    revealInExplorer,
    sourceControlViewMode,
    toggleSubmodule,
    visibleListRowsBySection,
    worktreePath
  } = controller
  if (!activeWorktree || !worktreePath) {
    return null
  }
  const currentWorktreeId = activeWorktree.id

  if (sourceControlViewMode === 'tree') {
    return <SourceControlPierreUncommittedTree controller={controller} sectionId={sectionId} />
  }

  return (
    <SourceControlVirtualFileList
      rows={visibleListRowsBySection[sectionId] ?? []}
      scrollElement={fileListScrollElement}
      getRowKey={(row) =>
        row.type === 'submodule-placeholder' ? row.key : `${row.entry.area}::${row.entry.path}`
      }
      renderRow={(row) => {
        if (row.type === 'submodule-placeholder') {
          return (
            <SubmodulePlaceholderRow
              key={row.key}
              depth={row.depth}
              state={row.state}
              message={row.message}
            />
          )
        }
        const entry = row.entry
        const key = `${entry.area}::${entry.path}`
        const isSubmoduleExpandable = isExpandableSubmoduleEntry(entry)
        return (
          <UncommittedEntryRow
            key={key}
            entry={entry}
            currentWorktreeId={currentWorktreeId}
            worktreePath={worktreePath}
            depth={entry.submoduleRoot ? 1 : 0}
            isOpenFile={activeOpenRowKeys.has(key)}
            onRevealInExplorer={revealInExplorer}
            connectionId={activeConnectionId}
            onOpen={handleOpenDiff}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onDiscard={requestDiscardEntry}
            commentCount={diffCommentCountByPath.get(entry.path) ?? 0}
            isSubmoduleExpanded={
              isSubmoduleExpandable
                ? expandedSubmoduleKeys.has(getSubmoduleExpansionKey(entry))
                : undefined
            }
            onToggleSubmodule={isSubmoduleExpandable ? toggleSubmodule : undefined}
          />
        )
      }}
    />
  )
}
