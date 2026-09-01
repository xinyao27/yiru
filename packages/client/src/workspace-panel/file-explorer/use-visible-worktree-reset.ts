import { useEffect, useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { shouldResetFileExplorerForVisibleWorktree } from './reset'
import { clearFileExplorerUndoHistory } from './undo-redo'

type VisibleWorktreeResetInput = {
  visibleWorktreePath: string | null
  resetSelection: () => void
  clearNameFilter: () => void
  resetAndLoad: () => void
}

export function useVisibleWorktreeReset({
  visibleWorktreePath,
  resetSelection,
  clearNameFilter,
  resetAndLoad
}: VisibleWorktreeResetInput): void {
  const lastWorktreePathRef = useRef<string | null>(null)
  const resetVisibleWorktree = useEventCallback((): void => {
    if (
      !visibleWorktreePath ||
      !shouldResetFileExplorerForVisibleWorktree(lastWorktreePathRef.current, visibleWorktreePath)
    ) {
      return
    }
    lastWorktreePathRef.current = visibleWorktreePath
    resetSelection()
    clearNameFilter()
    resetAndLoad()
    clearFileExplorerUndoHistory()
  })

  useEffect(() => resetVisibleWorktree(), [resetVisibleWorktree, visibleWorktreePath])
}
