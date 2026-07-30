import { VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT } from '@/runtime/virtualized-scroll-anchor-record-request'

const DELETE_POSITION_RESTORE_MAX_FRAMES = 180
const DELETE_POSITION_RESTORE_STABLE_FRAMES = 6

function findSidebarVirtualRowByKey(sidebar: Element, rowKey: string): HTMLElement | null {
  return (
    Array.from(sidebar.querySelectorAll<HTMLElement>('[data-worktree-virtual-row]')).find(
      (element) => element.getAttribute('data-worktree-virtual-row-key') === rowKey
    ) ?? null
  )
}

function shouldContinueDeleteSiblingPositionRestore(args: {
  attempts: number
  stableFrames: number
}): boolean {
  // Why: slow deletes leave the target row mounted; after initial focus/remount
  // settling, the restore loop must stop so user scrolling wins.
  return (
    args.attempts < DELETE_POSITION_RESTORE_MAX_FRAMES &&
    args.stableFrames < DELETE_POSITION_RESTORE_STABLE_FRAMES
  )
}

function preserveDeleteSiblingPosition(scope: HTMLElement | null): () => void {
  const sidebar = scope?.closest('[data-worktree-sidebar]')
  const row = scope?.closest('[data-worktree-virtual-row]')
  if (!(sidebar instanceof HTMLElement) || !(row instanceof HTMLElement)) {
    return () => {}
  }
  const rows = Array.from(
    sidebar.querySelectorAll<HTMLElement>('[data-worktree-virtual-row]')
  ).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  const rowIndex = rows.indexOf(row)
  const anchorRow = rows[rowIndex + 1] ?? rows[rowIndex - 1] ?? null
  const anchorKey = anchorRow?.getAttribute('data-worktree-virtual-row-key')
  const rowKey = row.getAttribute('data-worktree-virtual-row-key')
  if (!anchorKey || !rowKey) {
    return () => {}
  }
  const previousScrollTop = sidebar.scrollTop
  const previousScrollHeight = sidebar.scrollHeight
  const desiredTop = row.getBoundingClientRect().top

  return () => {
    let attempts = 0
    let stableFrames = 0
    const restore = (): void => {
      const currentSidebar = document.querySelector('[data-worktree-sidebar]')
      if (!(currentSidebar instanceof HTMLElement)) {
        return
      }
      const currentTarget = findSidebarVirtualRowByKey(currentSidebar, rowKey)
      const currentAnchor = currentTarget ?? findSidebarVirtualRowByKey(currentSidebar, anchorKey)
      if (currentAnchor) {
        const delta = currentAnchor.getBoundingClientRect().top - desiredTop
        if (Math.abs(delta) > 1) {
          currentSidebar.scrollTop += delta
          stableFrames = 0
        } else {
          stableFrames += 1
        }
      } else {
        currentSidebar.scrollTop = Math.max(
          0,
          previousScrollTop + currentSidebar.scrollHeight - previousScrollHeight
        )
        stableFrames = 0
      }
      attempts += 1
      if (shouldContinueDeleteSiblingPositionRestore({ attempts, stableFrames })) {
        window.requestAnimationFrame(restore)
      }
    }
    restore()
  }
}

export function prepareDeleteSiblingPositionRestore(scope: HTMLElement | null): () => void {
  const restoreSidebarPosition = preserveDeleteSiblingPosition(scope)
  scope
    ?.closest('[data-worktree-sidebar]')
    ?.dispatchEvent(new Event(VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT))
  return restoreSidebarPosition
}
