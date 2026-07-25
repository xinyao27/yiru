import { useCallback, useEffect, useRef, useState } from 'react'

import type { WorkspaceTitlebarActionId } from '../../../../shared/workspace-panel-titlebar-pinned'
import {
  commitTitlebarDrop,
  resolveDropTargetFromPoint,
  type PanelTitlebarDragSession,
  type PanelTitlebarDragSource
} from './titlebar-pin-drag'
import type { WorkspacePanelTitlebarDropTarget } from './titlebar-strip-items'

export type { PanelTitlebarDragSource } from './titlebar-pin-drag'

// Why: Electron titlebar uses -webkit-app-region: drag; HTML5 dragstart is
// unreliable there even on no-drag children, so pins use pointer capture.
const TITLEBAR_DRAG_THRESHOLD_PX = 4

type UseWorkspacePanelTitlebarPinDragArgs = {
  worktreeId: string
  effectivePinnedIds: readonly WorkspaceTitlebarActionId[]
  visibleCount: number
  commitPinned: (next: readonly WorkspaceTitlebarActionId[]) => void
}

export type WorkspacePanelTitlebarPinDrag = {
  dropTarget: WorkspacePanelTitlebarDropTarget
  isPanelDragActive: boolean
  handleItemPointerDown: (
    event: React.PointerEvent,
    id: WorkspaceTitlebarActionId,
    source: PanelTitlebarDragSource
  ) => void
}

export function useWorkspacePanelTitlebarPinDrag({
  worktreeId,
  effectivePinnedIds,
  visibleCount,
  commitPinned
}: UseWorkspacePanelTitlebarPinDragArgs): WorkspacePanelTitlebarPinDrag {
  const [dropTarget, setDropTarget] = useState<WorkspacePanelTitlebarDropTarget>(null)
  const [isPanelDragActive, setIsPanelDragActive] = useState(false)
  const dragSessionRef = useRef<PanelTitlebarDragSession | null>(null)
  const dropTargetRef = useRef<WorkspacePanelTitlebarDropTarget>(null)
  const effectivePinnedIdsRef = useRef(effectivePinnedIds)
  const visibleCountRef = useRef(visibleCount)
  const clickSwallowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitPinnedRef = useRef(commitPinned)

  effectivePinnedIdsRef.current = effectivePinnedIds
  visibleCountRef.current = visibleCount
  commitPinnedRef.current = commitPinned

  const swallowNextClick = useCallback((handleEl: HTMLElement) => {
    const swallow = (event: MouseEvent): void => {
      const target = event.target
      if (target instanceof Node && handleEl.contains(target)) {
        event.preventDefault()
        event.stopPropagation()
      }
      window.removeEventListener('click', swallow, true)
      if (clickSwallowTimeoutRef.current !== null) {
        clearTimeout(clickSwallowTimeoutRef.current)
        clickSwallowTimeoutRef.current = null
      }
    }
    window.addEventListener('click', swallow, true)
    clickSwallowTimeoutRef.current = setTimeout(() => {
      window.removeEventListener('click', swallow, true)
      clickSwallowTimeoutRef.current = null
    }, 0)
  }, [])

  const resolveStripRoot = useCallback((): ParentNode | null => {
    return document.querySelector(`[data-workspace-titlebar-strip="${worktreeId}"]`)
  }, [worktreeId])

  const finishDrag = useCallback(
    (commit: boolean) => {
      const session = dragSessionRef.current
      const highlightedTarget = dropTargetRef.current
      dragSessionRef.current = null
      dropTargetRef.current = null
      setIsPanelDragActive(false)
      setDropTarget(null)
      if (!session) {
        return
      }
      try {
        session.handleEl.releasePointerCapture(session.pointerId)
      } catch {
        // capture may already be released
      }
      if (session.promoted) {
        swallowNextClick(session.handleEl)
      }
      // Why: commit the last painted highlight, not a fresh hit-test on pointerup.
      // Re-resolving at release often lands on More when the user was aiming at
      // the insert-at-end gap next to it.
      if (!commit || !session.promoted || highlightedTarget == null) {
        return
      }
      commitTitlebarDrop({
        session,
        dropTarget: highlightedTarget,
        pinnedIds: effectivePinnedIdsRef.current,
        commitPinned: commitPinnedRef.current
      })
    },
    [swallowNextClick]
  )

  useEffect(() => {
    if (!isPanelDragActive) {
      return
    }
    const onPointerMove = (event: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || event.pointerId !== session.pointerId) {
        return
      }
      if (!session.promoted) {
        const dx = event.clientX - session.startX
        const dy = event.clientY - session.startY
        if (dx * dx + dy * dy < TITLEBAR_DRAG_THRESHOLD_PX * TITLEBAR_DRAG_THRESHOLD_PX) {
          return
        }
        session.promoted = true
        if (session.handleEl.isConnected) {
          try {
            session.handleEl.setPointerCapture(session.pointerId)
          } catch {
            // global listeners still drive the drag
          }
        }
      }
      const nextTarget = resolveDropTargetFromPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        stripRoot: resolveStripRoot(),
        visibleCount: visibleCountRef.current
      })
      dropTargetRef.current = nextTarget
      setDropTarget(nextTarget)
    }
    const onPointerUp = (event: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || event.pointerId !== session.pointerId) {
        return
      }
      finishDrag(true)
    }
    const onPointerCancel = (event: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || event.pointerId !== session.pointerId) {
        return
      }
      finishDrag(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        finishDrag(false)
      }
    }
    const onBlur = (): void => finishDrag(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
      if (clickSwallowTimeoutRef.current !== null) {
        clearTimeout(clickSwallowTimeoutRef.current)
        clickSwallowTimeoutRef.current = null
      }
    }
  }, [finishDrag, isPanelDragActive, resolveStripRoot])

  useEffect(() => {
    if (!isPanelDragActive) {
      return
    }
    const body = document.body
    const previousCursor = body.style.cursor
    const previousUserSelect = body.style.userSelect
    body.style.cursor = 'grabbing'
    body.style.userSelect = 'none'
    return () => {
      body.style.cursor = previousCursor
      body.style.userSelect = previousUserSelect
    }
  }, [isPanelDragActive])

  const handleItemPointerDown = useCallback(
    (event: React.PointerEvent, id: WorkspaceTitlebarActionId, source: PanelTitlebarDragSource) => {
      if (!event.isPrimary || event.button !== 0) {
        return
      }
      const handleEl = event.currentTarget
      if (!(handleEl instanceof HTMLElement)) {
        return
      }
      // Why: stop the tab-strip DndContext from treating this press as a tab drag.
      event.stopPropagation()
      dragSessionRef.current = {
        id,
        source,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        handleEl,
        promoted: false
      }
      setIsPanelDragActive(true)
      dropTargetRef.current = null
      setDropTarget(null)
    },
    []
  )

  return {
    dropTarget,
    isPanelDragActive,
    handleItemPointerDown
  }
}
