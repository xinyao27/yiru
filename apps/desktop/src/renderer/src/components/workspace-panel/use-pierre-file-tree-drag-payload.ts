import { useCallback } from 'react'

import {
  encodeWorkspaceFilePaths,
  WORKSPACE_FILE_PATH_MIME,
  WORKSPACE_FILE_PATHS_MIME
} from '@/lib/workspace-file-drag'

import type { PierreFileTreeData } from './pierre-file-tree-data'

export function usePierreFileTreeDragPayload({
  onDragSourceChange,
  selectedPaths,
  treeData
}: {
  onDragSourceChange: (path: string | null) => void
  selectedPaths: ReadonlySet<string>
  treeData: PierreFileTreeData
}): {
  onDragStartCapture: (event: React.DragEvent<HTMLElement>) => void
  onDragEndCapture: () => void
} {
  const onDragStartCapture = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      const row = event.nativeEvent
        .composedPath()
        .find(
          (entry): entry is HTMLElement =>
            entry instanceof HTMLElement && entry.dataset.type === 'item'
        )
      const canonicalPath = row?.dataset.itemPath
      const node = canonicalPath ? treeData.nodeByCanonicalPath.get(canonicalPath) : null
      if (!node) {
        return
      }
      const paths =
        selectedPaths.has(node.path) && selectedPaths.size > 1 ? [...selectedPaths] : [node.path]
      event.dataTransfer.setData(WORKSPACE_FILE_PATH_MIME, node.path)
      if (paths.length > 1) {
        event.dataTransfer.setData(WORKSPACE_FILE_PATHS_MIME, encodeWorkspaceFilePaths(paths))
      }
      event.dataTransfer.effectAllowed = 'copyMove'
      onDragSourceChange(node.path)
    },
    [onDragSourceChange, selectedPaths, treeData.nodeByCanonicalPath]
  )
  const onDragEndCapture = useCallback(() => onDragSourceChange(null), [onDragSourceChange])

  return { onDragStartCapture, onDragEndCapture }
}
