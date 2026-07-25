import React from 'react'

import { WORKSPACE_FILE_PATH_MIME } from '@/lib/workspace-file-drag'

export function useComposerFileDragOver(): {
  isFileDragOver: boolean
  dragHandlers: {
    onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void
    onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
  }
} {
  const [isFileDragOver, setIsFileDragOver] = React.useState(false)
  const dragCounterRef = React.useRef(0)

  const reset = React.useCallback(() => {
    dragCounterRef.current = 0
    setIsFileDragOver(false)
  }, [])

  const onDragEnter = React.useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    // Why: "Files" is the DataTransfer type the OS adds for native file drags;
    // internal in-app drags must not trigger the
    // attachment-drop highlight so they still route to their own handlers.
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    if (event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)) {
      return
    }
    dragCounterRef.current += 1
    setIsFileDragOver(true)
  }, [])

  const onDragLeave = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>): void => {
      if (!event.dataTransfer.types.includes('Files')) {
        return
      }
      // Why: mirror the onDragEnter guard so internal in-app drags (which may
      // carry both "Files" and the workspace path MIME type) don't decrement
      // the counter when enter skipped incrementing it — otherwise the counter
      // goes negative and the native-drag highlight state desyncs.
      if (event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)) {
        return
      }
      dragCounterRef.current -= 1
      if (dragCounterRef.current <= 0) {
        reset()
      }
    },
    [reset]
  )

  // Why: the preload bridge calls stopPropagation on native `drop` events so
  // React's onDrop never fires on the composer card. Listen at the document
  // level (also capture-phase) to reset the drag highlight whenever any drop
  // or dragend occurs anywhere in the window.
  React.useEffect(() => {
    const handler = (): void => {
      reset()
    }
    document.addEventListener('drop', handler, true)
    document.addEventListener('dragend', handler, true)
    return () => {
      document.removeEventListener('drop', handler, true)
      document.removeEventListener('dragend', handler, true)
    }
  }, [reset])

  return {
    isFileDragOver,
    dragHandlers: { onDragEnter, onDragLeave }
  }
}
