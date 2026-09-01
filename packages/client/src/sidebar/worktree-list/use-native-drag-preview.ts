import { getWorktreeSidebarDragAutoscroll } from '../worktree-sidebar-drag-autoscroll'
import {
  areWorktreeDragPreviewOffsetsEqual,
  EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
  getPointerDropStatusTarget
} from './drag-state'
import type { WorktreeDragCore } from './use-drag-core'

export function useNativeDragPreview(args: {
  core: WorktreeDragCore
  scrollRef: React.RefObject<HTMLDivElement | null>
  markScrollMovement: () => void
}): (event: React.DragEvent<HTMLDivElement>) => void {
  const {
    nativeAutoscrollFrameRef: worktreeNativeAutoscrollFrameIdRef,
    nativeAutoscrollTimeRef: worktreeNativeAutoscrollLastFrameTimeRef,
    nativeLatestPointRef: worktreeNativeLatestPointRef,
    sessionRef: worktreeDragSessionRef,
    cancelNativeAutoscroll: cancelWorktreeNativeAutoscroll,
    refreshSession: refreshWorktreeDragSession,
    computeDrop: computeWorktreeDrop,
    computeStatusDrop: computeWorktreeStatusDrop,
    clear: clearWorktreeDrag,
    eligibleLineageTarget: getEligibleLineageDropTarget,
    setNativeLineageDropTargetId,
    setState: setWorktreeDragState
  } = args.core
  const { scrollRef, markScrollMovement } = args

  const runWorktreeNativeAutoscrollFrame = (frameTime: number) => {
    worktreeNativeAutoscrollFrameIdRef.current = null
    const point = worktreeNativeLatestPointRef.current
    const container = scrollRef.current
    const session = worktreeDragSessionRef.current
    if (!point || !container || !session) {
      cancelWorktreeNativeAutoscroll()
      return
    }

    const previousFrameTime = worktreeNativeAutoscrollLastFrameTimeRef.current ?? frameTime
    worktreeNativeAutoscrollLastFrameTimeRef.current = frameTime
    const autoscroll = getWorktreeSidebarDragAutoscroll({
      point,
      containerRect: container.getBoundingClientRect(),
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      elapsedMs: frameTime - previousFrameTime
    })
    if (autoscroll) {
      markScrollMovement()
      container.scrollTop = autoscroll.scrollTop
      if (!refreshWorktreeDragSession()) {
        clearWorktreeDrag()
        return
      }
      const drop = computeWorktreeDrop(point.clientY)
      if (!drop) {
        const target = getPointerDropStatusTarget({
          container,
          x: point.clientX,
          y: point.clientY
        })
        const statusDrop = target.status
          ? computeWorktreeStatusDrop({
              pointerY: point.clientY,
              status: target.status,
              draggedIds: session.draggedIds
            })
          : null
        if (statusDrop) {
          setWorktreeDragState((prev) =>
            prev.dropIndex === statusDrop.dropIndex &&
            prev.dropIndicatorY === statusDrop.dropIndicatorY &&
            areWorktreeDragPreviewOffsetsEqual(
              prev.previewOffsetsByWorktreeId,
              statusDrop.previewOffsetsByWorktreeId
            )
              ? prev
              : { ...prev, ...statusDrop, pointerY: point.clientY }
          )
          return
        }
        setWorktreeDragState((prev) =>
          prev.dropIndex === null &&
          prev.dropIndicatorY === null &&
          prev.previewOffsetsByWorktreeId.size === 0
            ? prev
            : {
                ...prev,
                dropIndex: null,
                dropIndicatorY: null,
                previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
                pointerY: null
              }
        )
      } else {
        setWorktreeDragState((prev) =>
          prev.dropIndex === drop.dropIndex &&
          prev.dropIndicatorY === drop.dropIndicatorY &&
          areWorktreeDragPreviewOffsetsEqual(
            prev.previewOffsetsByWorktreeId,
            drop.previewOffsetsByWorktreeId
          )
            ? prev
            : { ...prev, ...drop, pointerY: point.clientY }
        )
      }
    }

    worktreeNativeAutoscrollFrameIdRef.current = window.requestAnimationFrame(
      runWorktreeNativeAutoscrollFrame
    )
  }

  const startWorktreeNativeAutoscroll = () => {
    if (worktreeNativeAutoscrollFrameIdRef.current !== null) {
      return
    }
    worktreeNativeAutoscrollLastFrameTimeRef.current = null
    worktreeNativeAutoscrollFrameIdRef.current = window.requestAnimationFrame(
      runWorktreeNativeAutoscrollFrame
    )
  }

  const handleWorktreeDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const session = worktreeDragSessionRef.current
    if (!session) {
      return
    }
    worktreeNativeLatestPointRef.current = { clientX: event.clientX, clientY: event.clientY }
    startWorktreeNativeAutoscroll()
    if (!refreshWorktreeDragSession()) {
      clearWorktreeDrag()
      return
    }
    const target = getEligibleLineageDropTarget(
      getPointerDropStatusTarget({
        container: event.currentTarget,
        x: event.clientX,
        y: event.clientY
      }),
      session.draggedIds
    )
    if (target.lineageParentId) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setNativeLineageDropTargetId(target.lineageParentId)
      setWorktreeDragState((prev) =>
        prev.dropIndex === null &&
        prev.dropIndicatorY === null &&
        prev.previewOffsetsByWorktreeId.size === 0
          ? prev
          : {
              ...prev,
              dropIndex: null,
              dropIndicatorY: null,
              previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
              pointerY: event.clientY
            }
      )
      return
    }
    setNativeLineageDropTargetId(null)

    const drop = computeWorktreeDrop(event.clientY)
    if (!drop) {
      const statusDrop = target.status
        ? computeWorktreeStatusDrop({
            pointerY: event.clientY,
            status: target.status,
            draggedIds: session.draggedIds
          })
        : null
      if (statusDrop) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setWorktreeDragState((prev) =>
          prev.dropIndex === statusDrop.dropIndex &&
          prev.dropIndicatorY === statusDrop.dropIndicatorY &&
          areWorktreeDragPreviewOffsetsEqual(
            prev.previewOffsetsByWorktreeId,
            statusDrop.previewOffsetsByWorktreeId
          )
            ? prev
            : { ...prev, ...statusDrop, pointerY: event.clientY }
        )
        return
      }
      setWorktreeDragState((prev) =>
        prev.dropIndex === null &&
        prev.dropIndicatorY === null &&
        prev.previewOffsetsByWorktreeId.size === 0
          ? prev
          : {
              ...prev,
              dropIndex: null,
              dropIndicatorY: null,
              previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
              pointerY: null
            }
      )
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setWorktreeDragState((prev) =>
      prev.dropIndex === drop.dropIndex &&
      prev.dropIndicatorY === drop.dropIndicatorY &&
      areWorktreeDragPreviewOffsetsEqual(
        prev.previewOffsetsByWorktreeId,
        drop.previewOffsetsByWorktreeId
      )
        ? prev
        : { ...prev, ...drop, pointerY: event.clientY }
    )
  }

  return handleWorktreeDragOver
}
