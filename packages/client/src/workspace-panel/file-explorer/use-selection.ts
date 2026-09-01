import { useState } from 'react'
import type React from 'react'
import { shellClient } from '~renderer/runtime/shell-client'

import type { FileExplorerRowProjection } from './row-projection'
import {
  createEmptyFileExplorerSelection,
  createSingleFileExplorerSelection,
  formatFileExplorerPathsForClipboard,
  getFileExplorerSelectionMode,
  updateFileExplorerSelection,
  updateFileExplorerSelectionPaths,
  type FileExplorerSelectionMode
} from './selection'
import type { TreeNode } from './types'

type UseFileExplorerSelectionResult = {
  selectedPath: string | null
  selectedPaths: Set<string>
  setSingleSelectedPath: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedPaths: (paths: Set<string>) => void
  resetSelection: () => void
  selectRowWithModifiers: (
    node: TreeNode,
    event: React.MouseEvent<HTMLButtonElement>,
    onReplaceClick: (node: TreeNode) => void
  ) => void
  moveSelection: (targetPath: string, mode: FileExplorerSelectionMode) => void
  preserveSelectionForContextMenu: (node: TreeNode) => void
  copyPathsForNode: (node: TreeNode, pathKind: 'absolute' | 'relative') => void
}

export function useFileExplorerSelection(
  rowProjection: FileExplorerRowProjection,
  isMac: boolean
): UseFileExplorerSelectionResult {
  const [selectionState, setSelectionState] = useState(createEmptyFileExplorerSelection)
  const setSingleSelectedPath = (value: React.SetStateAction<string | null>) => {
    setSelectionState((prev) => {
      if (typeof value === 'function') {
        // Why: legacy watcher cleanup still speaks in single-path updater terms;
        // apply it across the whole selected set so stale multi-selections converge.
        return updateFileExplorerSelectionPaths(prev, value)
      }
      const nextPath = value
      return createSingleFileExplorerSelection(nextPath)
    })
  }

  const resetSelection = () => {
    setSelectionState(createEmptyFileExplorerSelection())
  }

  const setSelectedPaths = (paths: Set<string>) => {
    setSelectionState((prev) => {
      const nextActive = paths.has(prev.activePath ?? '')
        ? prev.activePath
        : paths.size > 0
          ? [...paths][0]
          : null
      return { activePath: nextActive, anchorPath: nextActive, selectedPaths: paths }
    })
  }

  const moveSelection = (targetPath: string, mode: FileExplorerSelectionMode) => {
    const orderedPaths = rowProjection.getOrderedPaths()
    setSelectionState((prev) => updateFileExplorerSelection(prev, orderedPaths, targetPath, mode))
  }

  const selectRowWithModifiers = (
    node: TreeNode,
    event: React.MouseEvent<HTMLButtonElement>,
    onReplaceClick: (node: TreeNode) => void
  ) => {
    const selectionMode = getFileExplorerSelectionMode(
      {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey
      },
      isMac
    )

    if (selectionMode === 'replace') {
      onReplaceClick(node)
      return
    }

    // Why: tree refreshes are much more common than range/toggle selections
    // in large repos. Build order only for the modifier path that needs it.
    const orderedPaths = rowProjection.getOrderedPaths()
    setSelectionState((prev) =>
      updateFileExplorerSelection(prev, orderedPaths, node.path, selectionMode)
    )
  }

  const preserveSelectionForContextMenu = (node: TreeNode) => {
    // Why: right-clicking an existing multi-selection should keep the copy
    // target set; right-clicking outside it should behave like a single item.
    setSelectionState((prev) =>
      prev.selectedPaths.has(node.path) ? prev : createSingleFileExplorerSelection(node.path)
    )
  }

  const copyPathsForNode = (node: TreeNode, pathKind: 'absolute' | 'relative') => {
    const { selectedPaths } = selectionState
    const selectedNodes = selectedPaths.has(node.path)
      ? rowProjection.getRowsByPaths(selectedPaths)
      : []
    const actionNodes = selectedNodes.length > 0 ? selectedNodes : [node]
    void shellClient.ui.writeClipboardText(
      formatFileExplorerPathsForClipboard(actionNodes, pathKind)
    )
  }

  return {
    selectedPath: selectionState.activePath,
    selectedPaths: selectionState.selectedPaths,
    setSingleSelectedPath,
    setSelectedPaths,
    resetSelection,
    selectRowWithModifiers,
    moveSelection,
    preserveSelectionForContextMenu,
    copyPathsForNode
  }
}
