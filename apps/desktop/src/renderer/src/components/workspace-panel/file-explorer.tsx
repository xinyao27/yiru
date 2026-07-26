import React from 'react'

import { CoworkingFilesPane } from '@/components/coworking/files-pane'

import { FileExplorerFilesMemo } from './file-explorer-files'
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
  if (source.kind === 'coworking') {
    return <CoworkingFilesPane route={source.route} supportsDiff={source.supportsGit} />
  }
  return <FileExplorerFilesMemo isVisible={isVisible} workspacePanelTabId={workspacePanelTabId} />
}

export default React.memo(FileExplorer)
