import React from 'react'

import { translate } from '@/i18n/i18n'

import { FileExplorerBackgroundMenu } from './file-explorer-background-menu'
import { useFileExplorerInteractions } from './file-explorer-interactions'
import { useFileExplorerModel } from './file-explorer-model'
import { FileExplorerQueryHeader } from './file-explorer-query-header'
import { FileExplorerTreeContent } from './file-explorer-tree-content'

function FileExplorerFiles({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}): React.JSX.Element {
  const model = useFileExplorerModel({ isVisible, workspacePanelTabId })
  const interactions = useFileExplorerInteractions(model, workspacePanelTabId)
  const { view, owner } = model

  if (!owner.worktreePath) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-[11px]">
        {view.explorerView === 'search'
          ? translate(
              'auto.components.right.sidebar.Search.98c8435e36',
              'Select a workspace to search'
            )
          : translate(
              'auto.components.right.sidebar.FileExplorer.79b1537dd3',
              'Select a workspace to browse files'
            )}
      </div>
    )
  }

  return (
    <>
      {/* Why: all tree states keep one drop surface so empty/error views accept imports. */}
      <div
        ref={interactions.refs.setExplorerShellRef}
        data-yiru-explorer-shell
        data-selected-folder-relative-path={
          interactions.selection.selectedNode?.isDirectory
            ? interactions.selection.selectedNode.relativePath
            : undefined
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <FileExplorerQueryHeader model={model} interactions={interactions} />
        <FileExplorerTreeContent model={model} interactions={interactions} />
      </div>
      <FileExplorerBackgroundMenu
        open={interactions.menu.bgMenuOpen}
        onOpenChange={interactions.menu.setBgMenuOpen}
        point={interactions.menu.bgMenuPoint}
        worktreePath={owner.worktreePath}
        onStartNew={interactions.inline.startNew}
      />
    </>
  )
}

export const FileExplorerFilesMemo = React.memo(FileExplorerFiles)
