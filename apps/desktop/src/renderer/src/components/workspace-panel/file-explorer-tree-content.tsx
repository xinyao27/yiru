import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { dirname, normalizeRelativePath } from '@/lib/path'

import { canShowAddAsProjectAction } from './file-explorer-add-project-action'
import type { FileExplorerInteractions } from './file-explorer-interactions'
import type { FileExplorerModel } from './file-explorer-model'
import { FileExplorerRow } from './file-explorer-row'
import { FileExplorerTreeStatus } from './file-explorer-tree-status'
import { PierreFileExplorerTree } from './pierre-file-explorer-tree'
import { SearchResultsPane } from './search-results-pane'
import { shouldShowIgnoredDecoration, STATUS_COLORS } from './status-display'

export function FileExplorerTreeContent({
  model,
  interactions
}: {
  model: FileExplorerModel
  interactions: FileExplorerInteractions
}): React.JSX.Element {
  const { view, owner, tree, display, actions } = model
  const { selection, deletion, dragDrop, inline, handlers, refs } = interactions
  const isEmptyState = tree.visibleRowCount === 0 && !inline.inlineInput
  const isNameFilterLoading = view.nameFilterSource?.relativePaths === null
  const isLoading =
    isEmptyState && (view.hasNameFilter ? isNameFilterLoading : (tree.rootCache?.loading ?? true))
  const treeError = view.hasNameFilter ? view.nameFilterFiles.loadError : tree.rootError
  const hasError = isEmptyState && !isLoading && Boolean(treeError)
  const showTree = !isEmptyState
  const emptyMessage =
    view.hasNameFilter && !view.nameFilterFiles.loadError
      ? translate(
          'auto.components.right.sidebar.FileExplorer.2f4483d6c4',
          'No files match this filter'
        )
      : undefined

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className={cn(
          'h-full min-h-0 bg-sidebar py-2',
          view.explorerView !== 'files' && 'pointer-events-none invisible',
          dragDrop.isRootDragOver &&
            view.explorerView === 'files' &&
            !(dragDrop.dragSourcePath && dirname(dragDrop.dragSourcePath) === owner.worktreePath) &&
            'bg-border',
          dragDrop.isNativeDragOver &&
            view.explorerView === 'files' &&
            !dragDrop.nativeDropTargetDir &&
            'bg-border'
        )}
        data-native-file-drop-target={view.isFilesViewActive ? 'file-explorer' : undefined}
        data-native-file-drop-dir={owner.visibleFilesWorktreePath ?? undefined}
        onDragOver={dragDrop.rootDragHandlers.onDragOver}
        onDragEnter={dragDrop.rootDragHandlers.onDragEnter}
        onDragLeave={dragDrop.rootDragHandlers.onDragLeave}
        onDrop={dragDrop.rootDragHandlers.onDrop}
        onDragEnd={() => {
          dragDrop.stopDragEdgeScroll()
          dragDrop.setDropTargetDir(null)
        }}
        onContextMenuCapture={interactions.actions.handleBackgroundContextMenu}
        onDoubleClick={interactions.actions.handleBackgroundDoubleClick}
      >
        {!showTree && (
          <FileExplorerTreeStatus
            isLoading={isLoading}
            error={hasError ? treeError : null}
            isEmpty={isEmptyState && !isLoading && !hasError}
            emptyMessage={emptyMessage}
          />
        )}
        {showTree && (
          <PierreFileExplorerTree
            ref={refs.pierreTreeRef}
            worktreePath={owner.worktreePath!}
            rowProjection={tree.rowProjection}
            expandedPaths={tree.rowExpandedPaths}
            selectedPaths={selection.selectedPaths}
            flashingPath={interactions.display.flashingPath}
            inlineInput={inline.inlineInput}
            statusByRelativePath={display.statusByRelativePath}
            ignoredByRelativePath={tree.ignoredByRelativePath}
            scrollElementRef={refs.scrollRef}
            onActivateFile={handlers.handleClick}
            onDoubleClickFile={handlers.handleDoubleClick}
            onToggleDirectory={(node) => {
              if (view.hasNameFilter) {
                actions.handleToggleNameFilterDir(owner.activeWorktreeId!, node.path)
              } else {
                interactions.actions.toggleDir(owner.activeWorktreeId!, node.path)
              }
              if (!tree.rowExpandedPaths.has(node.path)) {
                void tree.loadDir(node.path, node.depth)
              }
            }}
            onSelectionChange={selection.setSelectedPaths}
            onRenameNode={interactions.actions.handlePierreRenameNode}
            onInlineInputSubmit={inline.handleInlineSubmit}
            onInlineInputCancel={inline.dismissInlineInput}
            onMoveDrop={dragDrop.handleMoveDrop}
            onDragSourceChange={dragDrop.setDragSourcePath}
            onNativeDragTargetChange={dragDrop.setNativeDropTargetDir}
            onNativeDragExpandDirectory={
              view.hasNameFilter
                ? actions.handleExpandNameFilterDir
                : dragDrop.handleNativeDragExpandDir
            }
            renderContextMenu={(node, context, isExpanded) => {
              const normalizedRelativePath = normalizeRelativePath(node.relativePath)
              const nodeStatus = node.isDirectory
                ? (display.folderStatusByRelativePath.get(normalizedRelativePath) ?? null)
                : (display.statusByRelativePath.get(normalizedRelativePath) ?? null)
              const isIgnored = shouldShowIgnoredDecoration(
                nodeStatus,
                tree.ignoredByRelativePath,
                normalizedRelativePath
              )
              const rowParentDir = node.isDirectory ? node.path : dirname(node.path)
              return (
                <FileExplorerRow
                  node={node}
                  isExpanded={isExpanded}
                  isLoading={node.isDirectory && Boolean(tree.dirCache[node.path]?.loading)}
                  isSelected={
                    selection.selectedPaths.has(node.path) ||
                    interactions.display.activeFileId === node.path
                  }
                  isFlashing={interactions.display.flashingPath === node.path}
                  selectedPaths={selection.selectedPaths}
                  nodeStatus={nodeStatus}
                  statusColor={nodeStatus ? STATUS_COLORS[nodeStatus] : null}
                  isIgnored={isIgnored}
                  deleteShortcutLabel={deletion.deleteShortcutLabel}
                  connectionId={owner.activeRepo?.connectionId ?? null}
                  runtimeDownloadContext={owner.runtimeDownloadContext}
                  supportsFolderDownload={owner.supportsFolderDownload}
                  canCollapseFolderSubtree={!view.hasNameFilter}
                  targetDir={node.isDirectory ? node.path : rowParentDir}
                  targetDepth={node.isDirectory ? node.depth + 1 : node.depth}
                  selectionSize={
                    selection.selectedPaths.has(node.path)
                      ? tree.rowProjection.countVisiblePaths(selection.selectedPaths)
                      : 1
                  }
                  onClick={() => undefined}
                  onDoubleClick={() => undefined}
                  onViewFile={() => handlers.handleClick(node)}
                  onContextMenuSelect={() => selection.preserveSelectionForContextMenu(node)}
                  onCopyPaths={(pathKind) => selection.copyPathsForNode(node, pathKind)}
                  onStartNew={inline.startNew}
                  onStartRename={inline.startRename}
                  onDuplicate={interactions.actions.handleDuplicate}
                  onAddFolderAsProject={() => interactions.actions.handleAddFolderAsProject(node)}
                  canAddAsProject={canShowAddAsProjectAction(node, owner.activeRepo)}
                  onOpenInTerminal={() => interactions.actions.handleOpenInTerminal(node)}
                  onRequestDelete={() => interactions.actions.handleContextMenuDelete(node)}
                  onCollapseFolderSubtree={() =>
                    interactions.actions.handleCollapseFolderSubtree(node)
                  }
                  onFindInFolder={() => interactions.actions.handleFindInFolder(node)}
                  onMoveDrop={dragDrop.handleMoveDrop}
                  onDragTargetChange={dragDrop.setDropTargetDir}
                  onDragSourceChange={dragDrop.setDragSourcePath}
                  onDragExpandDir={
                    view.hasNameFilter
                      ? actions.handleExpandNameFilterDir
                      : dragDrop.handleDragExpandDir
                  }
                  onNativeDragTargetChange={dragDrop.setNativeDropTargetDir}
                  onNativeDragExpandDir={
                    view.hasNameFilter
                      ? actions.handleExpandNameFilterDir
                      : dragDrop.handleNativeDragExpandDir
                  }
                  menuOnly
                  menuPoint={{ x: context.anchorRect.x, y: context.anchorRect.y }}
                  onMenuOpenChange={(open) => {
                    if (!open) {
                      context.close()
                    }
                  }}
                />
              )
            }}
          />
        )}
      </div>
      <div
        className={cn(
          'absolute inset-0 flex min-h-0 flex-col',
          view.explorerView !== 'search' && 'pointer-events-none invisible'
        )}
      >
        {view.searchPanel.activeWorktreeId ? (
          <SearchResultsPane {...view.searchPanel.resultsProps} />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            {translate(
              'auto.components.right.sidebar.Search.98c8435e36',
              'Select a workspace to search'
            )}
          </div>
        )}
      </div>
    </div>
  )
}
