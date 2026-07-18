import type React from 'react'
import type { ContextMenuOpenContext } from '@pierre/trees'
import type { GitFileStatus } from '../../../../shared/types'
import type { InlineInput } from './FileExplorerRow'
import type { FileExplorerRowProjection } from './file-explorer-row-projection'
import type { TreeNode } from './file-explorer-types'

export type PierreFileExplorerTreeHandle = {
  scrollToAbsolutePath: (path: string, align?: 'center' | 'nearest') => void
}

export type PierreFileExplorerTreeProps = {
  worktreePath: string
  rowProjection: FileExplorerRowProjection
  expandedPaths: ReadonlySet<string>
  selectedPaths: ReadonlySet<string>
  flashingPath: string | null
  inlineInput: InlineInput | null
  statusByRelativePath: ReadonlyMap<string, GitFileStatus>
  ignoredByRelativePath: ReadonlySet<string>
  scrollElementRef: React.MutableRefObject<HTMLDivElement | null>
  onActivateFile: (node: TreeNode) => void
  onDoubleClickFile: (node: TreeNode) => void
  onToggleDirectory: (node: TreeNode) => void
  onSelectionChange: (paths: Set<string>) => void
  onRenameNode: (node: TreeNode, newName: string) => void
  onInlineInputSubmit: (value: string) => void
  onInlineInputCancel: () => void
  onMoveDrop: (sourcePath: string, destinationDirectory: string) => void
  onDragSourceChange: (path: string | null) => void
  onNativeDragTargetChange: (directoryPath: string | null) => void
  onNativeDragExpandDirectory: (directoryPath: string) => void
  renderContextMenu: (
    node: TreeNode,
    context: ContextMenuOpenContext,
    isExpanded: boolean
  ) => React.ReactNode
}
