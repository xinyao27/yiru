import {
  pinWorkspacePanelTitlebarItem,
  reorderWorkspacePanelTitlebarPinnedIds,
  unpinWorkspacePanelTitlebarItem,
  type WorkspaceTitlebarActionId
} from '../../../../shared/workspace/panel-titlebar-pinned'
import type { WorkspacePanelTitlebarDropTarget } from './titlebar-strip-items'

export type PanelTitlebarDragSource = 'visible' | 'overflow'

export type PanelTitlebarDragSession = {
  id: WorkspaceTitlebarActionId
  source: PanelTitlebarDragSource
  pointerId: number
  startX: number
  startY: number
  handleEl: HTMLElement
  promoted: boolean
}

export function resolveDropTargetFromPoint({
  clientX,
  clientY,
  stripRoot,
  visibleCount
}: {
  clientX: number
  clientY: number
  stripRoot: ParentNode | null
  visibleCount: number
}): WorkspacePanelTitlebarDropTarget {
  if (!stripRoot) {
    return null
  }

  const slots = Array.from(stripRoot.querySelectorAll('[data-workspace-titlebar-slot]')).flatMap(
    (node) => {
      if (!(node instanceof HTMLElement)) {
        return []
      }
      const index = Number(node.dataset.workspaceTitlebarSlot)
      if (!Number.isInteger(index)) {
        return []
      }
      return [{ index, rect: node.getBoundingClientRect() }]
    }
  )
  slots.sort((left, right) => left.index - right.index || left.rect.left - right.rect.left)

  // Why: Open in is two buttons in one slot; merge sibling rects so the gap
  // midpoint covers the whole chip instead of only the icon half.
  const mergedByIndex = new Map<number, DOMRect>()
  for (const slot of slots) {
    const existing = mergedByIndex.get(slot.index)
    if (!existing) {
      mergedByIndex.set(slot.index, slot.rect)
      continue
    }
    const left = Math.min(existing.left, slot.rect.left)
    const right = Math.max(existing.right, slot.rect.right)
    const top = Math.min(existing.top, slot.rect.top)
    const bottom = Math.max(existing.bottom, slot.rect.bottom)
    mergedByIndex.set(slot.index, new DOMRect(left, top, right - left, bottom - top))
  }

  const ordered = Array.from(mergedByIndex.entries()).sort(([a], [b]) => a - b)
  for (const [index, rect] of ordered) {
    if (clientX < rect.left + rect.width / 2) {
      return index
    }
  }

  const more = stripRoot.querySelector('[data-workspace-titlebar-drop="more"]')
  if (more instanceof HTMLElement) {
    const moreRect = more.getBoundingClientRect()
    const overMore =
      clientX >= moreRect.left &&
      clientX <= moreRect.right &&
      clientY >= moreRect.top &&
      clientY <= moreRect.bottom
    if (overMore) {
      // Why: only the right half of More hides a pin. The left half (and any
      // gap before More after the last slot midpoint) stays insert-at-end so
      // reordering near the strip end does not accidentally unpin.
      if (clientX >= moreRect.left + moreRect.width * 0.5) {
        return 'more'
      }
      return visibleCount
    }
  }

  if (ordered.length > 0) {
    return visibleCount
  }
  return null
}

export function commitTitlebarDrop({
  session,
  dropTarget,
  pinnedIds,
  commitPinned
}: {
  session: PanelTitlebarDragSession
  dropTarget: WorkspacePanelTitlebarDropTarget
  pinnedIds: readonly WorkspaceTitlebarActionId[]
  commitPinned: (next: readonly WorkspaceTitlebarActionId[]) => void
}): void {
  if (dropTarget === 'more') {
    if (session.source === 'visible') {
      commitPinned(unpinWorkspacePanelTitlebarItem(pinnedIds, session.id))
    }
    return
  }
  if (typeof dropTarget !== 'number') {
    return
  }
  if (session.source === 'visible') {
    commitPinned(reorderWorkspacePanelTitlebarPinnedIds(pinnedIds, session.id, dropTarget))
    return
  }
  commitPinned(pinWorkspacePanelTitlebarItem(pinnedIds, session.id, dropTarget))
}
