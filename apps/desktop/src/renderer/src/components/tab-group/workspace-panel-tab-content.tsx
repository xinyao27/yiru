import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import { RightSidebarPanelContent } from '../right-sidebar/right-sidebar-panel-content'

export function WorkspacePanelTabContent({
  panel
}: {
  panel: WorkspacePanelTabContentType
}): React.JSX.Element {
  return (
    <div
      className="bg-background text-foreground absolute inset-0 flex min-h-0 min-w-0"
      data-terminal-focus-release-surface="true"
    >
      <RightSidebarPanelContent effectiveTab={panel} rightSidebarOpen isVisible />
    </div>
  )
}
