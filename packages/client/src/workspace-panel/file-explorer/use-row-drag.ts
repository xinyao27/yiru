import React, { useRef } from 'react'
import { toast } from 'sonner'
import {
  getWorkspaceFileDragRejectionMessage,
  readWorkspaceFileDragPaths,
  WORKSPACE_FILE_PATH_MIME
} from '~renderer/workspace/file-drag'

const DRAG_EXPAND_DELAY_MS = 500

type UseFileExplorerRowDragParams = {
  rowDropDir: string
  isDirectory: boolean
  nodePath: string
  isExpanded: boolean
  onDragTargetChange: (dir: string | null) => void
  onDragExpandDir: (dirPath: string) => void
  onMoveDrop: (sourcePath: string, destDir: string) => void
}

type RowDragHandlers = {
  setRowDragNode: (node: HTMLButtonElement | null) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragEnter: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
}

export function useFileExplorerRowDrag({
  rowDropDir,
  isDirectory,
  nodePath,
  isExpanded,
  onDragTargetChange,
  onDragExpandDir,
  onMoveDrop
}: UseFileExplorerRowDragParams): RowDragHandlers {
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragCounterRef = useRef(0)

  const clearExpandTimer = () => {
    if (expandTimerRef.current !== null) {
      clearTimeout(expandTimerRef.current)
      expandTimerRef.current = null
    }
  }

  const setRowDragNode = (node: HTMLButtonElement | null): void => {
    // Why: delayed drag-expand timers target this row; unmounting the row
    // makes those timers stale even if the browser skips dragleave.
    if (node === null) {
      clearExpandTimer()
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    const isInternal = e.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)
    if (!isInternal) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    const isInternal = e.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)
    if (!isInternal) {
      return
    }
    e.preventDefault()
    e.stopPropagation()

    dragCounterRef.current += 1
    onDragTargetChange(rowDropDir)
    if (dragCounterRef.current === 1 && isDirectory && !isExpanded) {
      clearExpandTimer()
      expandTimerRef.current = setTimeout(() => {
        expandTimerRef.current = null
        onDragExpandDir(nodePath)
      }, DRAG_EXPAND_DELAY_MS)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      clearExpandTimer()
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    clearExpandTimer()
    onDragTargetChange(null)
    const dragPaths = readWorkspaceFileDragPaths(e.dataTransfer)
    if (dragPaths.status === 'rejected') {
      toast.error(getWorkspaceFileDragRejectionMessage(dragPaths.reason))
      return
    }
    for (const sourcePath of dragPaths.paths) {
      onMoveDrop(sourcePath, rowDropDir)
    }
  }

  return { setRowDragNode, handleDragOver, handleDragEnter, handleDragLeave, handleDrop }
}
