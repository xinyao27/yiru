import React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import ChecksPanel from '../../checks-panel'
import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from '../../right-sidebar-panel-source'
import SourceControl from '../../source-control'
import type { SourceControlPanelView } from './state'

type SourceControlWorkspacePanelProps = {
  source?: RightSidebarPanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
  view?: SourceControlPanelView
  onViewChange?: (view: SourceControlPanelView) => void
}

export default function SourceControlWorkspacePanel({
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId,
  view: controlledView,
  onViewChange
}: SourceControlWorkspacePanelProps): React.JSX.Element {
  const storedView = useAppStore((state) =>
    workspacePanelTabId ? state.sourceControlPanelViewByTab[workspacePanelTabId] : undefined
  )
  const setStoredView = useAppStore((state) => state.setSourceControlPanelView)
  const view = controlledView ?? storedView ?? 'changes'

  const handleViewChange = (value: string): void => {
    if (value !== 'changes' && value !== 'review') {
      return
    }
    if (onViewChange) {
      onViewChange(value)
      return
    }
    if (workspacePanelTabId) {
      setStoredView(workspacePanelTabId, value)
    }
  }

  return (
    <Tabs value={view} onValueChange={handleViewChange} className="h-full min-h-0 gap-0">
      <div className="border-border shrink-0 border-b px-2">
        <TabsList
          variant="line"
          size="dense"
          className="w-full"
          aria-label={translate(
            'auto.components.workspace.panel.source.control.workspace.panel.views',
            'Changes and review'
          )}
        >
          <TabsTrigger value="changes">
            {translate(
              'auto.components.workspace.panel.source.control.workspace.panel.changes',
              'Changes'
            )}
          </TabsTrigger>
          <TabsTrigger value="review">
            {translate(
              'auto.components.workspace.panel.source.control.workspace.panel.review',
              'Review'
            )}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="changes" className="min-h-0 overflow-hidden">
        <SourceControl
          source={source}
          isVisible={isVisible && view === 'changes'}
          workspacePanelTabId={workspacePanelTabId}
        />
      </TabsContent>
      <TabsContent value="review" className="min-h-0 overflow-hidden">
        <ChecksPanel source={source} isVisible={isVisible && view === 'review'} />
      </TabsContent>
    </Tabs>
  )
}
