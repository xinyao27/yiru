import type { SourceControlController } from './controller'
import { getSourceControlDirectoryActionPaths } from './directory-action-paths'
import { SourceControlTreeDirectoryRow } from './directory-rows'
import { SubmodulePlaceholderRow } from './entry-details'
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
    collapsedTreeDirs,
    diffCommentCountByPath,
    expandedSubmoduleKeys,
    fileListScrollElement,
    handleContextMenu,
    handleOpenDiff,
    handleSelect,
    handleStage,
    handleStageAllPaths,
    handleUnstage,
    handleUnstagePaths,
    isExecutingBulk,
    normalizedFilter,
    requestDiscardEntry,
    revealInExplorer,
    selectedKeySet,
    setPendingDiscard,
    sourceControlViewMode,
    toggleSubmodule,
    toggleTreeDir,
    visibleListRowsBySection,
    visibleTreeRowsBySection,
    worktreePath
  } = controller
  if (!activeWorktree || !worktreePath) {
    return null
  }
  const currentWorktreeId = activeWorktree.id

  if (sourceControlViewMode === 'tree') {
    return (
      <SourceControlVirtualFileList
        rows={visibleTreeRowsBySection[sectionId] ?? []}
        scrollElement={fileListScrollElement}
        getRowKey={(node) => node.key}
        renderRow={(node) => {
          if (node.type === 'submodule-placeholder') {
            return (
              <SubmodulePlaceholderRow
                key={node.key}
                depth={node.depth}
                state={node.state}
                message={node.message}
              />
            )
          }
          if (node.type === 'directory') {
            return (
              <SourceControlTreeDirectoryRow
                key={node.key}
                node={node}
                actionPaths={getSourceControlDirectoryActionPaths(node)}
                hideBulkActions={Boolean(normalizedFilter)}
                isExecutingBulk={isExecutingBulk}
                isCollapsed={collapsedTreeDirs.has(node.key)}
                onToggle={() => toggleTreeDir(node.key)}
                onRequestDiscardPaths={(area, paths) =>
                  setPendingDiscard({ kind: 'area', area, paths })
                }
                onStagePaths={handleStageAllPaths}
                onUnstagePaths={handleUnstagePaths}
              />
            )
          }
          const isSubmoduleExpandable = isExpandableSubmoduleEntry(node.entry)
          return (
            <UncommittedEntryRow
              key={node.key}
              entryKey={node.key}
              entry={node.entry}
              currentWorktreeId={currentWorktreeId}
              worktreePath={worktreePath}
              depth={node.depth}
              selected={selectedKeySet.has(node.key)}
              isOpenFile={activeOpenRowKeys.has(node.key)}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
              onRevealInExplorer={revealInExplorer}
              connectionId={activeConnectionId}
              onOpen={handleOpenDiff}
              onStage={handleStage}
              onUnstage={handleUnstage}
              onDiscard={requestDiscardEntry}
              commentCount={diffCommentCountByPath.get(node.entry.path) ?? 0}
              showPathHint={false}
              isSubmoduleExpanded={
                isSubmoduleExpandable
                  ? expandedSubmoduleKeys.has(getSubmoduleExpansionKey(node.entry))
                  : undefined
              }
              onToggleSubmodule={isSubmoduleExpandable ? toggleSubmodule : undefined}
            />
          )
        }}
      />
    )
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
            entryKey={key}
            entry={entry}
            currentWorktreeId={currentWorktreeId}
            worktreePath={worktreePath}
            depth={entry.submoduleRoot ? 1 : 0}
            selected={selectedKeySet.has(key)}
            isOpenFile={activeOpenRowKeys.has(key)}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
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
