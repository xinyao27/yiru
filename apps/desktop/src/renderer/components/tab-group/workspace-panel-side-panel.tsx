import { useEffect, useState } from 'react'
import { useSidebarResize } from '~renderer/hooks/use-sidebar-resize'
import { cn } from '~renderer/lib/class-names'
import { useAppStore } from '~renderer/store'
import type { WorkspacePanelTabContentType } from '~shared/types'

import { RightSidebarPanelContent } from '../workspace-panel/right-sidebar-panel-content'

const MIN_PANEL_WIDTH = 220
const MAX_PANEL_WIDTH = 4000
// Why: the editor half stays usable no matter how far the tree is dragged out.
const MIN_EDITOR_WIDTH = 320

function computeMaxWorkspacePanelSideWidth(layoutWidth: number): number {
  // Why: before the first measurement the stored width must render untouched,
  // otherwise the panel snaps to the minimum for a frame on every tab mount.
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) {
    return MAX_PANEL_WIDTH
  }

  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, layoutWidth - MIN_EDITOR_WIDTH))
}

type WorkspacePanelSidePanelProps = {
  panel: WorkspacePanelTabContentType
  panelTabId: string
}

export function WorkspacePanelSidePanel({
  panel,
  panelTabId
}: WorkspacePanelSidePanelProps): React.JSX.Element {
  const panelWidth = useAppStore((state) => state.rightSidebarWidth)
  const setPanelWidth = useAppStore((state) => state.setRightSidebarWidth)
  const [layoutWidth, setLayoutWidth] = useState(0)

  const maxPanelWidth = computeMaxWorkspacePanelSideWidth(layoutWidth)
  const { containerRef, isResizing, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width: Math.min(maxPanelWidth, Math.max(MIN_PANEL_WIDTH, panelWidth)),
    minWidth: MIN_PANEL_WIDTH,
    maxWidth: maxPanelWidth,
    deltaSign: -1,
    setWidth: setPanelWidth
  })

  useEffect(() => {
    const layout = containerRef.current?.parentElement
    if (!layout) {
      return
    }

    const updateLayoutWidth = (): void => {
      setLayoutWidth(layout.clientWidth)
    }

    updateLayoutWidth()
    const observer = new ResizeObserver(updateLayoutWidth)
    observer.observe(layout)
    return () => observer.disconnect()
  }, [containerRef])

  return (
    <div
      ref={containerRef}
      // Why: the former right-sidebar width remains the user's preferred tree
      // width; the resize hook owns the inline width so a rerender mid-drag
      // cannot snap the panel back to the persisted value.
      className="bg-sidebar text-sidebar-foreground border-border relative flex min-h-0 shrink-0 border-l"
    >
      <div
        data-workspace-panel-resize-handle=""
        // Why: match the worktree sidebar's wider drag target; a 1px seam is too
        // hard to acquire with the pointer.
        className={cn(
          'hover:bg-ring/20 absolute top-0 -left-px z-10 h-full w-1 cursor-col-resize transition-colors',
          isResizing && 'bg-ring/30'
        )}
        onMouseDown={onResizeStart}
      />
      <RightSidebarPanelContent
        effectiveTab={panel}
        rightSidebarOpen
        isVisible
        workspacePanelTabId={panelTabId}
      />
    </div>
  )
}
