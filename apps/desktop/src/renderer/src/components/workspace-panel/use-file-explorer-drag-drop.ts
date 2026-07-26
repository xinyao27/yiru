import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  getWorkspaceFileDragRejectionMessage,
  readWorkspaceFileDragPaths,
  WORKSPACE_FILE_PATH_MIME
} from '@/lib/workspace-file-drag'
import { useAppStore } from '@/store'

import {
  getDragEdgeScrollTarget,
  useFileExplorerDragEdgeScroll
} from './file-explorer-drag-edge-scroll'
import { useFileExplorerPathMove } from './file-explorer-path-move'

export { getDragEdgeScrollTarget }

type UseFileExplorerDragDropParams = {
  worktreePath: string | null
  activeWorktreeId: string | null
  expanded: Set<string>
  toggleDir: (worktreeId: string, dirPath: string) => void
  refreshDir: (dirPath: string) => Promise<void>
  scrollRef: RefObject<HTMLDivElement | null>
}

type UseFileExplorerDragDropResult = {
  handleMoveDrop: (sourcePath: string, destDir: string) => void
  handleDragExpandDir: (dirPath: string) => void
  dropTargetDir: string | null
  setDropTargetDir: (dir: string | null) => void
  dragSourcePath: string | null
  setDragSourcePath: (path: string | null) => void
  isRootDragOver: boolean
  isNativeDragOver: boolean
  nativeDropTargetDir: string | null
  setNativeDropTargetDir: (dir: string | null) => void
  handleNativeDragExpandDir: (dirPath: string) => void
  stopDragEdgeScroll: () => void
  rootDragHandlers: {
    onDragOver: (event: React.DragEvent) => void
    onDragEnter: (event: React.DragEvent) => void
    onDragLeave: (event: React.DragEvent) => void
    onDrop: (event: React.DragEvent) => void
  }
  clearNativeDragState: () => void
}

export function useFileExplorerDragDrop({
  worktreePath,
  activeWorktreeId,
  expanded,
  toggleDir,
  refreshDir,
  scrollRef
}: UseFileExplorerDragDropParams): UseFileExplorerDragDropResult {
  const [isRootDragOver, setIsRootDragOver] = useState(false)
  const rootDragCounterRef = useRef(0)
  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null)
  const [dragSourcePath, setDragSourcePath] = useState<string | null>(null)
  const [isNativeDragOver, setIsNativeDragOver] = useState(false)
  const nativeRootDragCounterRef = useRef(0)
  const [nativeDropTargetDir, setNativeDropTargetDir] = useState<string | null>(null)
  const { recordDragClientY, stopDragEdgeScroll } = useFileExplorerDragEdgeScroll(scrollRef)
  const clearDropTarget = useCallback(() => setDropTargetDir(null), [])
  const handleMoveDrop = useFileExplorerPathMove({
    worktreePath,
    activeWorktreeId,
    refreshDir,
    clearDropTarget
  })

  const clearDragState = useCallback(() => {
    rootDragCounterRef.current = 0
    nativeRootDragCounterRef.current = 0
    setIsRootDragOver(false)
    setDropTargetDir(null)
    setDragSourcePath(null)
    setIsNativeDragOver(false)
    setNativeDropTargetDir(null)
  }, [])
  const stopAndClearDragState = useCallback(() => {
    clearDragState()
    stopDragEdgeScroll()
  }, [clearDragState, stopDragEdgeScroll])

  useEffect(() => {
    const handleGlobalDragFinish = (): void => {
      // Why: preload consumes native drops before React sees them.
      stopAndClearDragState()
    }
    document.addEventListener('drop', handleGlobalDragFinish, true)
    document.addEventListener('dragend', handleGlobalDragFinish, true)
    window.addEventListener('blur', handleGlobalDragFinish)
    return () => {
      stopDragEdgeScroll()
      document.removeEventListener('drop', handleGlobalDragFinish, true)
      document.removeEventListener('dragend', handleGlobalDragFinish, true)
      window.removeEventListener('blur', handleGlobalDragFinish)
    }
  }, [stopAndClearDragState, stopDragEdgeScroll])

  const clearNativeDragState = useCallback(() => {
    // Why: preload-consumed drops must still stop the edge-scroll loop.
    stopAndClearDragState()
  }, [stopAndClearDragState])

  const handleRootDragOver = useCallback(
    (event: React.DragEvent) => {
      const isInternal = event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)
      const isNative = event.dataTransfer.types.includes('Files')
      if (!isInternal && !isNative) {
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = isInternal ? 'move' : 'copy'
      recordDragClientY(event.clientY)
    },
    [recordDragClientY]
  )
  const handleRootDragEnter = useCallback((event: React.DragEvent) => {
    const isInternal = event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)
    const isNative = !isInternal && event.dataTransfer.types.includes('Files')
    if (!isInternal && !isNative) {
      return
    }
    event.preventDefault()
    if (isInternal) {
      rootDragCounterRef.current += 1
      setIsRootDragOver(true)
    } else {
      nativeRootDragCounterRef.current += 1
      setIsNativeDragOver(true)
    }
  }, [])
  const handleRootDragLeave = useCallback(() => {
    rootDragCounterRef.current -= 1
    if (rootDragCounterRef.current <= 0) {
      rootDragCounterRef.current = 0
      setIsRootDragOver(false)
    }
    nativeRootDragCounterRef.current -= 1
    if (nativeRootDragCounterRef.current <= 0) {
      nativeRootDragCounterRef.current = 0
      setIsNativeDragOver(false)
    }
    if (rootDragCounterRef.current === 0 && nativeRootDragCounterRef.current === 0) {
      stopDragEdgeScroll()
    }
  }, [stopDragEdgeScroll])
  const handleRootDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      stopDragEdgeScroll()
      rootDragCounterRef.current = 0
      setIsRootDragOver(false)
      setDropTargetDir(null)
      // Why: native imports arrive through preload IPC, not this handler.
      clearNativeDragState()
      if (!worktreePath) {
        return
      }
      const dragPaths = readWorkspaceFileDragPaths(event.dataTransfer)
      if (dragPaths.status === 'rejected') {
        toast.error(getWorkspaceFileDragRejectionMessage(dragPaths.reason))
        return
      }
      for (const sourcePath of dragPaths.paths) {
        handleMoveDrop(sourcePath, worktreePath)
      }
    },
    [clearNativeDragState, handleMoveDrop, stopDragEdgeScroll, worktreePath]
  )
  // Why: the row/root drop targets read this object by identity every render
  // (see file-explorer-interactions.tsx); without memoizing it, a fresh
  // object here defeats every consumer's React.memo even though each handler
  // leaf below is already useCallback-stable.
  const rootDragHandlers = useMemo(
    () => ({
      onDragOver: handleRootDragOver,
      onDragEnter: handleRootDragEnter,
      onDragLeave: handleRootDragLeave,
      onDrop: handleRootDrop
    }),
    [handleRootDragOver, handleRootDragEnter, handleRootDragLeave, handleRootDrop]
  )

  const handleDragExpandDir = useCallback(
    (dirPath: string) => {
      if (activeWorktreeId && !expanded.has(dirPath)) {
        toggleDir(activeWorktreeId, dirPath)
      }
    },
    [activeWorktreeId, expanded, toggleDir]
  )
  const handleNativeDragExpandDir = useCallback(
    (dirPath: string) => {
      if (!activeWorktreeId) {
        return
      }
      // Why: delayed native expansion must never collapse a folder expanded meanwhile.
      useAppStore.setState((state) => {
        const current = state.expandedDirs[activeWorktreeId] ?? new Set<string>()
        if (current.has(dirPath)) {
          return state
        }
        const next = new Set(current)
        next.add(dirPath)
        return { expandedDirs: { ...state.expandedDirs, [activeWorktreeId]: next } }
      })
    },
    [activeWorktreeId]
  )

  // Why: this hook's return is consumed as a single opaque `dragDrop` group by
  // useFileExplorerInteractions' outer useMemo (file-explorer-interactions.tsx)
  // — every field below is already individually stable, so memoize the
  // wrapper too or that outer memo recomputes on every render regardless.
  return useMemo(
    () => ({
      handleMoveDrop,
      handleDragExpandDir,
      dropTargetDir,
      setDropTargetDir,
      dragSourcePath,
      setDragSourcePath,
      isRootDragOver,
      isNativeDragOver,
      nativeDropTargetDir,
      setNativeDropTargetDir,
      handleNativeDragExpandDir,
      stopDragEdgeScroll,
      rootDragHandlers,
      clearNativeDragState
    }),
    [
      handleMoveDrop,
      handleDragExpandDir,
      dropTargetDir,
      setDropTargetDir,
      dragSourcePath,
      setDragSourcePath,
      isRootDragOver,
      isNativeDragOver,
      nativeDropTargetDir,
      setNativeDropTargetDir,
      handleNativeDragExpandDir,
      stopDragEdgeScroll,
      rootDragHandlers,
      clearNativeDragState
    ]
  )
}
