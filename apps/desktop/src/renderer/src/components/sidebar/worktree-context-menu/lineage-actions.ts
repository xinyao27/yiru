import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'

import type { WorktreeContextMenuState } from './state'

function getParentPickerAnchor(scope: HTMLElement | null, worktreeId: string): HTMLElement | null {
  const dragRow = scope?.closest<HTMLElement>('[data-worktree-drag-id]')
  return dragRow?.dataset.worktreeDragId === worktreeId ? dragRow : scope
}

export function useLineageMenuActions(args: {
  state: WorktreeContextMenuState
  scopeRef: RefObject<HTMLDivElement | null>
  setMenuOpenState: (open: boolean) => void
}) {
  const { state, scopeRef, setMenuOpenState } = args
  const { activeContextWorktrees, validParentWorktreeId, worktree } = state
  const updateWorktreeLineage = useAppStore((store) => store.updateWorktreeLineage)
  const [parentPicker, setParentPicker] = useState<{
    childWorktreeId: string
    anchorElement: HTMLElement
  } | null>(null)
  const pendingParentPickerRef = useRef<{
    childWorktreeId: string
    anchorElement: HTMLElement
  } | null>(null)
  const parentPickerFallbackTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (parentPickerFallbackTimerRef.current != null) {
        window.clearTimeout(parentPickerFallbackTimerRef.current)
      }
    },
    []
  )

  const handleOpenParent = useCallback(() => {
    if (validParentWorktreeId) {
      activateAndRevealWorktree(validParentWorktreeId)
    }
  }, [validParentWorktreeId])

  const openPendingParentPicker = useCallback(() => {
    const pendingParentPicker = pendingParentPickerRef.current
    if (!pendingParentPicker) {
      return
    }
    pendingParentPickerRef.current = null
    if (parentPickerFallbackTimerRef.current != null) {
      window.clearTimeout(parentPickerFallbackTimerRef.current)
      parentPickerFallbackTimerRef.current = null
    }
    setParentPicker(pendingParentPicker)
  }, [])

  const handleOpenParentPicker = useCallback(
    (event?: { preventDefault: () => void }) => {
      event?.preventDefault()
      const anchorElement = getParentPickerAnchor(scopeRef.current, worktree.id)
      if (!anchorElement) {
        return
      }
      pendingParentPickerRef.current = { childWorktreeId: worktree.id, anchorElement }
      setMenuOpenState(false)
      // Why: the picker should open from the menu's close-auto-focus callback,
      // but this keeps keyboard activation working if that callback is skipped.
      parentPickerFallbackTimerRef.current = window.setTimeout(openPendingParentPicker, 50)
    },
    [openPendingParentPicker, scopeRef, setMenuOpenState, worktree.id]
  )

  const handleRemoveParentLink = useCallback(() => {
    void Promise.all(
      activeContextWorktrees.map((item) => updateWorktreeLineage(item.id, { noParent: true }))
    )
  }, [activeContextWorktrees, updateWorktreeLineage])

  const handleCloseAutoFocus = useCallback((): boolean => {
    // Why: Sleep/Delete may remount the sidebar while Base UI is restoring
    // focus. Keep focus on the scroll owner without moving its virtualized rows.
    if (pendingParentPickerRef.current) {
      window.setTimeout(openPendingParentPicker, 0)
      return false
    }
    const sidebar = scopeRef.current?.closest('[data-worktree-sidebar]')
    if (sidebar instanceof HTMLElement) {
      sidebar.focus({ preventScroll: true })
    }
    return false
  }, [openPendingParentPicker, scopeRef])

  return {
    handleCloseAutoFocus,
    handleOpenParent,
    handleOpenParentPicker,
    handleRemoveParentLink,
    parentPicker,
    setParentPicker
  }
}

export type LineageMenuActions = ReturnType<typeof useLineageMenuActions>
