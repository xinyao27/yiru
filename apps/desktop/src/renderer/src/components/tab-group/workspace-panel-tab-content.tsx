import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import { RightSidebarPanelContent } from '../right-sidebar/right-sidebar-panel-content'

export function WorkspacePanelTabContent({
  panel
}: {
  panel: WorkspacePanelTabContentType
}): React.JSX.Element {
  return (
    <div
      // Why: workspace panels are fully interactive surfaces; marking the body
      // as terminal-release chrome makes Electron drag the window on clicks.
      className="bg-background text-foreground absolute inset-0 flex min-h-0 min-w-0"
    >
      <RightSidebarPanelContent effectiveTab={panel} rightSidebarOpen isVisible />
    </div>
  )
}
