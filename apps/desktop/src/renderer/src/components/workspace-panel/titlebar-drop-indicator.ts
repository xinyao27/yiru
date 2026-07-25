import type { DropIndicator } from '@/components/tab-bar/drop-indicator'

import type { WorkspacePanelTitlebarDropTarget } from './titlebar-strip-items'

// Why: titlebar chrome is denser than tabs; a 1px seam reads as an insertion
// cue without covering neighboring icon buttons.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}

export function getTitlebarSlotDropIndicator({
  dropTarget,
  slotIndex,
  visibleCount
}: {
  dropTarget: WorkspacePanelTitlebarDropTarget
  slotIndex: number
  visibleCount: number
}): DropIndicator {
  if (typeof dropTarget !== 'number') {
    return null
  }
  if (dropTarget === slotIndex) {
    return 'left'
  }
  if (dropTarget === visibleCount && slotIndex === visibleCount - 1) {
    return 'right'
  }
  return null
}

export function getTitlebarMoreDropIndicatorClasses({
  dropTarget,
  visibleCount
}: {
  dropTarget: WorkspacePanelTitlebarDropTarget
  visibleCount: number
}): string {
  if (dropTarget === 'more') {
    return 'bg-accent'
  }
  if (dropTarget === visibleCount) {
    return getDropIndicatorClasses('left')
  }
  return ''
}
