import {
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import type { RefObject } from 'react'
import { useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import {
  captureTabGroupPanelGeometrySnapshot,
  resolveActivePaneColumnSplitTarget,
  type ActivePaneColumnSplitTarget,
  type TabGroupPanelGeometrySnapshot
} from './panel-split-target'
import {
  getTabDragActivationDistance,
  isTabDragData,
  type HoveredTabDropTarget,
  type TabDragItemData
} from './tab-drag-data'
import { getDragPointer } from './tab-drag-pointer'
import { TabDragPointerSensor } from './tab-drag-pointer-sensor'
import {
  applyDragPreviewTab,
  captureTabDragActivationSnapshot,
  restoreSourceGroupActiveTabAfterCrossGroupDrop,
  restoreTabDragActivationSnapshot,
  type TabDragActivationSnapshot
} from './tab-drag-preview-activation'
import { resolveDragPreviewTabId } from './tab-drag-preview-target'
import { useHoveredTabInsertion, type HoveredTabInsertion } from './tab-insertion'

type TabDragGesture = {
  activeDrag: TabDragItemData | null
  dragGeometryRef: RefObject<TabGroupPanelGeometrySnapshot | null>
  finishDrag: (restoreSnapshot: boolean, activeData?: TabDragItemData) => void
  hoveredDropTarget: HoveredTabDropTarget | null
  hoveredTabInsertion: HoveredTabInsertion | null
  isTabDragActiveRef: RefObject<boolean>
  onDragMove: (event: DragMoveEvent) => void
  onDragOver: (event: DragOverEvent) => void
  onDragStart: (event: DragStartEvent) => void
  sensors: ReturnType<typeof useSensors>
  setDragRootNode: (node: HTMLDivElement | null) => void
}

export function useTabDragGesture(worktreeId: string, enabled: boolean): TabDragGesture {
  const [activeDrag, setActiveDrag] = useState<TabDragItemData | null>(null)
  const [hoveredDropTarget, setHoveredDropTarget] = useState<HoveredTabDropTarget | null>(null)
  const preDragActivationSnapshotRef = useRef<TabDragActivationSnapshot | null>(null)
  const lastPreviewRef = useRef<{ groupId: string; tabId: string | null } | null>(null)
  const lastHoveredTabPreviewRef = useRef<{ groupId: string; tabId: string } | null>(null)
  const isTabDragActiveRef = useRef(false)
  const dragGeometryRef = useRef<TabGroupPanelGeometrySnapshot | null>(null)
  const releaseMissedEndFallbackRef = useRef<(() => void) | null>(null)
  const tabInsertion = useHoveredTabInsertion(isTabDragData, getDragPointer)
  const pointerSensor = useSensor(TabDragPointerSensor, {
    // Why: keeping one sensor shape across hidden and visible worktrees avoids
    // changing dnd-kit's internal effect dependency length.
    activationConstraint: { distance: getTabDragActivationDistance(enabled) }
  })
  const sensors = useSensors(pointerSensor)

  const releaseMissedEndFallback = () => {
    releaseMissedEndFallbackRef.current?.()
    releaseMissedEndFallbackRef.current = null
  }
  const clearDragState = useEventCallback((): void => {
    isTabDragActiveRef.current = false
    releaseMissedEndFallback()
    setActiveDrag(null)
    setHoveredDropTarget(null)
    tabInsertion.clear()
    preDragActivationSnapshotRef.current = null
    lastPreviewRef.current = null
    lastHoveredTabPreviewRef.current = null
    dragGeometryRef.current = null
  })

  const installMissedEndFallback = () => {
    releaseMissedEndFallback()
    let cleanupTimer: number | null = null
    const clearIfDndMissedEnd = (): void => {
      if (cleanupTimer !== null) {
        window.clearTimeout(cleanupTimer)
      }
      cleanupTimer = window.setTimeout(() => {
        cleanupTimer = null
        if (isTabDragActiveRef.current) {
          // Why: Chromium/dnd-kit can miss drag end/cancel and leave later
          // clicks looking like drag releases.
          clearDragState()
        }
      }, 0)
    }
    window.addEventListener('pointerup', clearIfDndMissedEnd)
    window.addEventListener('pointercancel', clearIfDndMissedEnd)
    window.addEventListener('blur', clearIfDndMissedEnd)
    window.addEventListener('focus', clearIfDndMissedEnd)
    releaseMissedEndFallbackRef.current = () => {
      if (cleanupTimer !== null) {
        window.clearTimeout(cleanupTimer)
      }
      window.removeEventListener('pointerup', clearIfDndMissedEnd)
      window.removeEventListener('pointercancel', clearIfDndMissedEnd)
      window.removeEventListener('blur', clearIfDndMissedEnd)
      window.removeEventListener('focus', clearIfDndMissedEnd)
    }
  }

  const setDragRootNode = (node: HTMLDivElement | null): void => {
    if (!node) {
      releaseMissedEndFallback()
    }
  }
  const restorePreDragActivation = () => {
    const snapshot = preDragActivationSnapshotRef.current
    if (snapshot) {
      restoreTabDragActivationSnapshot(worktreeId, snapshot)
    }
  }
  const restoreSourceGroupAfterCrossGroupDrop = (activeData: TabDragItemData) => {
    const snapshot = preDragActivationSnapshotRef.current
    if (snapshot) {
      restoreSourceGroupActiveTabAfterCrossGroupDrop({
        worktreeId,
        snapshot,
        sourceGroupId: activeData.groupId,
        movedTabId: activeData.unifiedTabId
      })
    }
  }
  const finishDrag = (restoreSnapshot: boolean, activeData?: TabDragItemData) => {
    if (restoreSnapshot) {
      restorePreDragActivation()
    } else if (activeData) {
      restoreSourceGroupAfterCrossGroupDrop(activeData)
    }
    clearDragState()
  }

  const updateDragPreviewActivation = (
    event: DragMoveEvent | DragOverEvent,
    activeData: TabDragItemData
  ) => {
    const snapshot = preDragActivationSnapshotRef.current
    if (!snapshot) {
      return
    }
    const overData = event.over?.data.current
    if (isTabDragData(overData) && overData.unifiedTabId !== activeData.unifiedTabId) {
      lastHoveredTabPreviewRef.current = {
        groupId: overData.groupId,
        tabId: overData.unifiedTabId
      }
    }
    const preview = resolveDragPreviewTabId({
      activeDrag: activeData,
      overData,
      preDragActiveTabIdByGroup: snapshot.activeTabIdByGroup,
      lastHoveredTabPreview: lastHoveredTabPreviewRef.current
    })
    const lastPreview = lastPreviewRef.current
    if (lastPreview?.groupId === preview.groupId && lastPreview.tabId === preview.tabId) {
      return
    }
    lastPreviewRef.current = preview
    applyDragPreviewTab({
      worktreeId,
      groupId: preview.groupId,
      tabId: preview.tabId,
      activeGroupId: preview.groupId
    })
  }

  const updateHoveredDropTarget = (splitTarget: ActivePaneColumnSplitTarget | null) => {
    setHoveredDropTarget((previous) => {
      if (!splitTarget) {
        return previous === null ? previous : null
      }
      if (previous?.groupId === splitTarget.groupId && previous.zone === splitTarget.zone) {
        return previous
      }
      return {
        groupId: splitTarget.groupId,
        zone: splitTarget.zone,
        panelRect: splitTarget.panelRect
      }
    })
  }

  const handleDragUpdate = (event: DragMoveEvent | DragOverEvent) => {
    const activeData = event.active.data.current
    if (isTabDragData(activeData) && activeData.worktreeId === worktreeId) {
      updateDragPreviewActivation(event, activeData)
    }
    const state = useAppStore.getState()
    const splitTarget = resolveActivePaneColumnSplitTarget({
      event,
      groupsByWorktree: state.groupsByWorktree,
      layoutByWorktree: state.layoutByWorktree,
      worktreeId,
      getDragPointer,
      geometry: dragGeometryRef.current
    })
    updateHoveredDropTarget(splitTarget)
    if (splitTarget) {
      tabInsertion.clear()
    } else {
      tabInsertion.update(event)
    }
  }
  const onDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data.current
    if (!isTabDragData(dragData) || dragData.worktreeId !== worktreeId) {
      clearDragState()
      return
    }
    setActiveDrag(dragData)
    isTabDragActiveRef.current = true
    installMissedEndFallback()
    dragGeometryRef.current = captureTabGroupPanelGeometrySnapshot(worktreeId)
    preDragActivationSnapshotRef.current = captureTabDragActivationSnapshot(worktreeId)
  }
  const onDragMove = (event: DragMoveEvent) => handleDragUpdate(event)
  const onDragOver = (_event: DragOverEvent) => {}

  return {
    activeDrag,
    dragGeometryRef,
    finishDrag,
    hoveredDropTarget,
    hoveredTabInsertion: tabInsertion.hoveredTabInsertion,
    isTabDragActiveRef,
    onDragMove,
    onDragOver,
    onDragStart,
    sensors,
    setDragRootNode
  }
}
