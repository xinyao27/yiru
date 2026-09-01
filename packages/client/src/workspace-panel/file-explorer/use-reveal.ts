import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import { getRevealAncestorDirs } from './paths'
import type { FileExplorerRowProjection } from './row-projection'
import type { DirCache } from './types'

type UseFileExplorerRevealParams = {
  isExplorerAttached: boolean
  activeWorktreeId: string | null
  worktreePath: string | null
  pendingExplorerReveal: {
    worktreeId: string
    filePath: string
    requestId: number
    flash?: boolean
  } | null
  clearPendingExplorerReveal: () => void
  expanded: Set<string>
  dirCache: Record<string, DirCache>
  rootCache: DirCache | undefined
  rowProjection: FileExplorerRowProjection
  loadDir: (dirPath: string, depth: number, options?: { force?: boolean }) => Promise<boolean>
  setSelectedPath: (path: string | null) => void
  setFlashingPath: Dispatch<SetStateAction<string | null>>
  virtualizer: {
    scrollToIndex: (index: number, options: { align: 'center' | 'auto' }) => void
  }
}

export function useFileExplorerReveal({
  isExplorerAttached,
  activeWorktreeId,
  worktreePath,
  pendingExplorerReveal,
  clearPendingExplorerReveal,
  expanded,
  dirCache,
  rootCache,
  rowProjection,
  loadDir,
  setSelectedPath,
  setFlashingPath,
  virtualizer
}: UseFileExplorerRevealParams): void {
  const flashTimeoutRef = useRef<number | null>(null)
  const revealScrollFrameRef = useRef<number | null>(null)
  const revealScrollTimeoutRef = useRef<number | null>(null)

  const cancelRevealScroll = useEventCallback((): void => {
    if (revealScrollFrameRef.current !== null) {
      cancelAnimationFrame(revealScrollFrameRef.current)
      revealScrollFrameRef.current = null
    }
    if (revealScrollTimeoutRef.current !== null) {
      window.clearTimeout(revealScrollTimeoutRef.current)
      revealScrollTimeoutRef.current = null
    }
  })

  const cancelRevealTimers = useEventCallback((): void => {
    cancelRevealScroll()
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = null
    }
  })

  useEffect(() => {
    if (!isExplorerAttached) {
      cancelRevealTimers()
    }
  }, [cancelRevealTimers, isExplorerAttached])
  useEffect(() => cancelRevealTimers, [cancelRevealTimers])

  const pendingRevealAncestorDirs = (() => {
    if (
      !pendingExplorerReveal ||
      !activeWorktreeId ||
      pendingExplorerReveal.worktreeId !== activeWorktreeId ||
      !worktreePath
    ) {
      return null
    }

    return getRevealAncestorDirs(worktreePath, pendingExplorerReveal.filePath)
  })()

  useEffect(() => {
    if (!pendingExplorerReveal || !activeWorktreeId || !worktreePath) {
      return
    }

    if (!pendingRevealAncestorDirs) {
      clearPendingExplorerReveal()
      return
    }

    useAppStore.setState((state) => {
      const currentExpanded = state.expandedDirs[activeWorktreeId] ?? new Set<string>()
      const nextExpanded = new Set(currentExpanded)
      let changed = false

      for (const dirPath of pendingRevealAncestorDirs) {
        if (!nextExpanded.has(dirPath)) {
          nextExpanded.add(dirPath)
          changed = true
        }
      }

      if (!changed) {
        return state
      }

      return {
        expandedDirs: {
          ...state.expandedDirs,
          [activeWorktreeId]: nextExpanded
        }
      }
    })

    void (async () => {
      const rootLoaded = await loadDir(worktreePath, -1)
      if (!rootLoaded) {
        return
      }

      for (let depth = 0; depth < pendingRevealAncestorDirs.length; depth += 1) {
        const ancestorLoaded = await loadDir(pendingRevealAncestorDirs[depth], depth)
        if (!ancestorLoaded) {
          return
        }
      }
    })()
  }, [
    activeWorktreeId,
    clearPendingExplorerReveal,
    loadDir,
    pendingExplorerReveal,
    pendingRevealAncestorDirs,
    worktreePath
  ])

  useEffect(() => {
    if (
      !pendingExplorerReveal ||
      !activeWorktreeId ||
      pendingExplorerReveal.worktreeId !== activeWorktreeId ||
      !worktreePath ||
      !pendingRevealAncestorDirs
    ) {
      return
    }

    const targetPath = pendingExplorerReveal.filePath
    const parentDirPath =
      pendingRevealAncestorDirs.length > 0 ? pendingRevealAncestorDirs.at(-1)! : worktreePath
    const parentDirCache = dirCache[parentDirPath]
    const missingExpandedAncestor = pendingRevealAncestorDirs.find(
      (dirPath) => !expanded.has(dirPath)
    )
    const missingAncestor = pendingRevealAncestorDirs.find(
      (dirPath) => !rowProjection.hasPath(dirPath)
    )
    const parentDirStillLoading =
      parentDirPath === worktreePath
        ? (rootCache?.loading ?? true)
        : (parentDirCache?.loading ?? true)
    const parentDirKnown = parentDirPath === worktreePath ? !!rootCache : !!parentDirCache

    if (
      (rootCache?.loading ?? true) ||
      missingExpandedAncestor ||
      missingAncestor ||
      parentDirStillLoading ||
      !parentDirKnown
    ) {
      return
    }

    const fallbackPath = rowProjection.hasPath(parentDirPath) ? parentDirPath : null
    const revealPath = rowProjection.hasPath(targetPath) ? targetPath : fallbackPath
    if (!revealPath) {
      clearPendingExplorerReveal()
      return
    }

    clearPendingExplorerReveal()
    setSelectedPath(revealPath)

    // Only flash when explicitly requested (e.g. "Reveal in Explorer" from Source Control).
    // Auto-reveals on tab switch skip the flash to avoid visual noise.
    if (pendingExplorerReveal.flash !== false) {
      setFlashingPath(revealPath)
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current)
      }
      flashTimeoutRef.current = window.setTimeout(() => {
        setFlashingPath((current) => (current === revealPath ? null : current))
        flashTimeoutRef.current = null
      }, 2000)
    }

    cancelRevealScroll()
    revealScrollFrameRef.current = requestAnimationFrame(() => {
      revealScrollFrameRef.current = null
      revealScrollTimeoutRef.current = window.setTimeout(() => {
        revealScrollTimeoutRef.current = null
        const targetIndex = rowProjection.getIndexByPath(revealPath)
        if (targetIndex !== null) {
          virtualizer.scrollToIndex(targetIndex, { align: 'center' })
        }
      }, 0)
    })
  }, [
    activeWorktreeId,
    cancelRevealScroll,
    clearPendingExplorerReveal,
    dirCache,
    expanded,
    pendingExplorerReveal,
    pendingRevealAncestorDirs,
    rowProjection,
    rootCache,
    setFlashingPath,
    setSelectedPath,
    flashTimeoutRef,
    virtualizer,
    worktreePath
  ])
}
