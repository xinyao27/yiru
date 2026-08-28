import { useEffect, useRef, useState } from 'react'

import { useEventCallback } from '../react/use-event-callback'
import type { PaneManager } from './pane-manager/pane-manager'

type TerminalPaneRenameInput = {
  containerRef: React.RefObject<HTMLDivElement | null>
  managerRef: React.RefObject<PaneManager | null>
  onRemoveTitle: (paneId: number) => void
  paneTitlesRef: React.RefObject<Record<number, string>>
  persistLayoutSnapshot: () => void
  removedTitleLeafIdsRef: React.RefObject<Set<string>>
  setPaneTitles: React.Dispatch<React.SetStateAction<Record<number, string>>>
}

type TerminalPaneRename = {
  handleRemoveTitle: (paneId: number) => void
  handleRenameBlur: () => void
  handleRenameCancel: () => void
  handleRenameSubmit: () => void
  handleStartRename: (paneId: number) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  renameValue: string
  renamingPaneId: number | null
  setContainerRef: (node: HTMLDivElement | null) => void
  setRenameValue: React.Dispatch<React.SetStateAction<string>>
  setRenamingPaneId: React.Dispatch<React.SetStateAction<number | null>>
}

export function useTerminalPaneRename({
  containerRef,
  managerRef,
  onRemoveTitle,
  paneTitlesRef,
  persistLayoutSnapshot,
  removedTitleLeafIdsRef,
  setPaneTitles
}: TerminalPaneRenameInput): TerminalPaneRename {
  const [renamingPaneId, setRenamingPaneId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)
  const sessionIdRef = useRef(0)
  const blurCommitEnabledRef = useRef(true)
  const userRequestedBlurCommitRef = useRef(false)
  const focusFrameRef = useRef<number | null>(null)
  const enableBlurFrameRef = useRef<number | null>(null)
  const refocusFrameRef = useRef<number | null>(null)

  const cancelPendingFrames = useEventCallback(() => {
    for (const frameRef of [focusFrameRef, enableBlurFrameRef, refocusFrameRef]) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  })
  const closeSession = (): void => {
    sessionIdRef.current += 1
    blurCommitEnabledRef.current = true
    userRequestedBlurCommitRef.current = false
    cancelPendingFrames()
  }
  const handleStartRename = (paneId: number): void => {
    cancelPendingFrames()
    sessionIdRef.current += 1
    blurCommitEnabledRef.current = false
    userRequestedBlurCommitRef.current = false
    submittedRef.current = false
    setRenameValue(paneTitlesRef.current[paneId] ?? '')
    setRenamingPaneId(paneId)
  }
  const handleRenameSubmit = (): void => {
    if (renamingPaneId === null || submittedRef.current) {
      return
    }
    submittedRef.current = true
    const trimmed = renameValue.trim()
    if (trimmed.length === 0) {
      if (paneTitlesRef.current[renamingPaneId]) {
        onRemoveTitle(renamingPaneId)
      }
    } else {
      setPaneTitles((previous) => ({ ...previous, [renamingPaneId]: trimmed }))
      paneTitlesRef.current = { ...paneTitlesRef.current, [renamingPaneId]: trimmed }
      const leafId = managerRef.current
        ?.getPanes()
        .find((pane) => pane.id === renamingPaneId)?.leafId
      if (leafId) {
        removedTitleLeafIdsRef.current.delete(leafId)
      }
      persistLayoutSnapshot()
    }
    closeSession()
    setRenamingPaneId(null)
  }
  const handleRenameCancel = (): void => {
    submittedRef.current = true
    closeSession()
    setRenamingPaneId(null)
  }
  const handleRenameBlur = (): void => {
    if (submittedRef.current) {
      return
    }
    if (blurCommitEnabledRef.current && userRequestedBlurCommitRef.current) {
      handleRenameSubmit()
      return
    }
    if (renamingPaneId === null || refocusFrameRef.current !== null) {
      return
    }
    const sessionId = sessionIdRef.current
    const paneId = renamingPaneId
    refocusFrameRef.current = requestAnimationFrame(() => {
      refocusFrameRef.current = null
      if (sessionIdRef.current !== sessionId || renamingPaneId !== paneId) {
        return
      }
      const input = renameInputRef.current
      if (!input) {
        blurCommitEnabledRef.current = true
        return
      }
      input.focus()
      input.select()
      blurCommitEnabledRef.current = true
    })
  }

  useEffect(() => {
    if (renamingPaneId === null) {
      return
    }
    const markPointerBlurIntent = (event: PointerEvent): void => {
      const input = renameInputRef.current
      if (!input || !(event.target instanceof Node) || !input.contains(event.target)) {
        userRequestedBlurCommitRef.current = true
      }
    }
    const markKeyboardBlurIntent = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        userRequestedBlurCommitRef.current = true
      }
    }
    document.addEventListener('pointerdown', markPointerBlurIntent, true)
    document.addEventListener('keydown', markKeyboardBlurIntent, true)
    return () => {
      document.removeEventListener('pointerdown', markPointerBlurIntent, true)
      document.removeEventListener('keydown', markKeyboardBlurIntent, true)
    }
  }, [renamingPaneId])

  useEffect(() => {
    if (renamingPaneId === null) {
      return
    }
    const sessionId = sessionIdRef.current
    const paneId = renamingPaneId
    submittedRef.current = false
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null
      if (sessionIdRef.current !== sessionId || renamingPaneId !== paneId) {
        return
      }
      const input = renameInputRef.current
      if (!input) {
        return
      }
      input.focus()
      input.select()
      enableBlurFrameRef.current = requestAnimationFrame(() => {
        enableBlurFrameRef.current = null
        if (
          sessionIdRef.current === sessionId &&
          renamingPaneId === paneId &&
          renameInputRef.current === input &&
          document.activeElement === input
        ) {
          blurCommitEnabledRef.current = true
        }
      })
    })
    return () => cancelPendingFrames()
  }, [cancelPendingFrames, renamingPaneId])

  return {
    handleRemoveTitle: onRemoveTitle,
    handleRenameBlur,
    handleRenameCancel,
    handleRenameSubmit,
    handleStartRename,
    renameInputRef,
    renameValue,
    renamingPaneId,
    setContainerRef: (node) => {
      containerRef.current = node
      if (node === null) {
        closeSession()
      }
    },
    setRenameValue,
    setRenamingPaneId
  }
}
