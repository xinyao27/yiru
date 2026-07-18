import { useCallback, useEffect, useRef } from 'react'
import type { PierreFileTreeData } from './pierre-file-tree-data'

const NATIVE_DRAG_EXPAND_DELAY_MS = 500

export function usePierreFileTreeNativeDrop({
  expandedPaths,
  onNativeDragExpandDirectory,
  onNativeDragTargetChange,
  treeData
}: {
  expandedPaths: ReadonlySet<string>
  onNativeDragExpandDirectory: (directoryPath: string) => void
  onNativeDragTargetChange: (directoryPath: string | null) => void
  treeData: PierreFileTreeData
}): {
  onDragOverCapture: (event: React.DragEvent<HTMLElement>) => void
  onDragLeaveCapture: (event: React.DragEvent<HTMLElement>) => void
} {
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveredDirectoryRef = useRef<string | null>(null)
  const markedRowRef = useRef<HTMLElement | null>(null)

  const clearTarget = useCallback(
    (host?: HTMLElement) => {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current)
        expandTimerRef.current = null
      }
      markedRowRef.current?.removeAttribute('data-yiru-native-drop-target')
      markedRowRef.current = null
      hoveredDirectoryRef.current = null
      host?.removeAttribute('data-native-file-drop-dir')
      onNativeDragTargetChange(null)
    },
    [onNativeDragTargetChange]
  )

  useEffect(() => () => clearTarget(), [clearTarget])

  const onDragOverCapture = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes('Files')) {
        return
      }
      const row = event.nativeEvent
        .composedPath()
        .find(
          (entry): entry is HTMLElement =>
            entry instanceof HTMLElement && entry.dataset.type === 'item'
        )
      const canonicalPath = row?.dataset.itemPath
      const node = canonicalPath ? treeData.nodeByCanonicalPath.get(canonicalPath) : null
      const directory = node?.isDirectory ? node : null
      if (!directory) {
        clearTarget(event.currentTarget)
        return
      }

      event.currentTarget.dataset.nativeFileDropDir = directory.path
      if (markedRowRef.current !== row) {
        markedRowRef.current?.removeAttribute('data-yiru-native-drop-target')
        row?.setAttribute('data-yiru-native-drop-target', 'true')
        markedRowRef.current = row ?? null
      }
      if (hoveredDirectoryRef.current === directory.path) {
        return
      }
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current)
      }
      hoveredDirectoryRef.current = directory.path
      onNativeDragTargetChange(directory.path)
      if (!expandedPaths.has(directory.path)) {
        expandTimerRef.current = setTimeout(() => {
          expandTimerRef.current = null
          onNativeDragExpandDirectory(directory.path)
        }, NATIVE_DRAG_EXPAND_DELAY_MS)
      }
    },
    [clearTarget, expandedPaths, onNativeDragExpandDirectory, onNativeDragTargetChange, treeData]
  )

  const onDragLeaveCapture = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return
      }
      clearTarget(event.currentTarget)
    },
    [clearTarget]
  )

  return { onDragOverCapture, onDragLeaveCapture }
}
