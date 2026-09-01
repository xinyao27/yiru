import React from 'react'

import { FileExplorerFilesMemo } from './file-explorer/files'
import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from './right-sidebar-panel-source'

function FileExplorer({
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId
}: {
  source?: RightSidebarPanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
}): React.JSX.Element {
  void source
  return <FileExplorerFilesMemo isVisible={isVisible} workspacePanelTabId={workspacePanelTabId} />
}

export default FileExplorer
