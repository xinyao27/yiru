import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import {
  getWorkspaceFileDragRejectionMessage,
  readWorkspaceFileDragPaths,
  WORKSPACE_FILE_PATH_MIME
} from '~renderer/workspace/file-drag'

import { getDragEdgeScrollTarget, useFileExplorerDragEdgeScroll } from './drag-edge-scroll'
import { useFileExplorerPathMove } from './path-move'

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
  const clearDropTarget = () => setDropTargetDir(null)
  const handleMoveDrop = useFileExplorerPathMove({
    worktreePath,
    activeWorktreeId,
    refreshDir,
    clearDropTarget
  })

  const clearDragState = () => {
    rootDragCounterRef.current = 0
    nativeRootDragCounterRef.current = 0
    setIsRootDragOver(false)
    setDropTargetDir(null)
    setDragSourcePath(null)
    setIsNativeDragOver(false)
    setNativeDropTargetDir(null)
  }
  const stopAndClearDragState = useEventCallback(() => {
    clearDragState()
    stopDragEdgeScroll()
  })

  useEffect(() => {
    const handleGlobalDragFinish = (): void => {
      // Why: the Electron adapter consumes native drops before React sees them.
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

  const clearNativeDragState = () => {
    // Why: adapter-consumed drops must still stop the edge-scroll loop.
    stopAndClearDragState()
  }

  const handleRootDragOver = (event: React.DragEvent) => {
    const isInternal = event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)
    const isNative = event.dataTransfer.types.includes('Files')
    if (!isInternal && !isNative) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = isInternal ? 'move' : 'copy'
    recordDragClientY(event.clientY)
  }
  const handleRootDragEnter = (event: React.DragEvent) => {
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
  }
  const handleRootDragLeave = () => {
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
  }
  const handleRootDrop = (event: React.DragEvent) => {
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
  }
  // Why: the row/root drop targets consume these handlers as one capability
  // group instead of each reconstructing the mapping independently.
  const rootDragHandlers = (() => ({
    onDragOver: handleRootDragOver,
    onDragEnter: handleRootDragEnter,
    onDragLeave: handleRootDragLeave,
    onDrop: handleRootDrop
  }))()

  const handleDragExpandDir = (dirPath: string) => {
    if (activeWorktreeId && !expanded.has(dirPath)) {
      toggleDir(activeWorktreeId, dirPath)
    }
  }
  const handleNativeDragExpandDir = (dirPath: string) => {
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
  }

  // Why: the interaction surface consumes drag and drop as one capability
  // group rather than coupling to the hook's internal state.
  return (() => ({
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
  }))()
}
