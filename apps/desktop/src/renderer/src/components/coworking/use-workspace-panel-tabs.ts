import { useCallback, useMemo, useState } from 'react'

import type { CoworkingWorkspaceRoute } from '@/components/coworking/types'
import type { ActivityBarItem } from '@/components/workspace-panel/activity-bar-buttons'
import { createRightSidebarActivityItems } from '@/components/workspace-panel/right-sidebar-activity-items'
import { getVisibleRightSidebarActivityItems } from '@/components/workspace-panel/right-sidebar-activity-visibility'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { useAppStore } from '@/store'

import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import type { SourceControlPanelView } from '../workspace-panel/source-control/workspace-panel/state'
import { useCoworkingChecksReadState, type CoworkingChecksReadState } from './checks-pane'

export type CoworkingWorkspacePanelTabs = {
  activePanel: WorkspacePanelTabContentType | null
  checksState: CoworkingChecksReadState
  closePanel: (panel: WorkspacePanelTabContentType) => void
  items: readonly ActivityBarItem[]
  openItems: readonly ActivityBarItem[]
  openPanel: (panel: WorkspacePanelTabContentType) => void
  selectSession: () => void
  setSourceControlView: (view: SourceControlPanelView) => void
  sourceControlView: SourceControlPanelView
}

export function useCoworkingWorkspacePanelTabs({
  route,
  connected,
  supportsGit
}: {
  route: CoworkingWorkspaceRoute
  connected: boolean
  supportsGit: boolean
}): CoworkingWorkspacePanelTabs {
  const explorerShortcut = useShortcutLabel('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutLabel('sidebar.sourceControl.toggle')
  const portsShortcut = useShortcutLabel('sidebar.ports.toggle')
  const requestedPanel = useAppStore((state) => state.rightSidebarTab)
  const requestedSourceControlView = useAppStore((state) => state.requestedSourceControlPanelView)
  const panelRequestId = useAppStore((state) => state.rightSidebarRouteRequestId)
  const [previousRequestId, setPreviousRequestId] = useState(panelRequestId)
  const [activePanel, setActivePanel] = useState<WorkspacePanelTabContentType | null>(null)
  const [openPanels, setOpenPanels] = useState<readonly WorkspacePanelTabContentType[]>([])
  const [sourceControlView, setSourceControlView] = useState<SourceControlPanelView>('changes')
  const items = useMemo(
    () =>
      getVisibleRightSidebarActivityItems(
        createRightSidebarActivityItems({
          explorer: explorerShortcut,
          sourceControl: sourceControlShortcut,
          ports: portsShortcut
        }),
        { isFolder: !supportsGit, isFolderWorkspace: false, isSshRepo: false }
      ),
    [explorerShortcut, portsShortcut, sourceControlShortcut, supportsGit]
  )
  const activatePanel = useCallback((panel: WorkspacePanelTabContentType): void => {
    setOpenPanels((current) => (current.includes(panel) ? current : [...current, panel]))
    setActivePanel(panel)
  }, [])
  const openPanel = useCallback(
    (panel: WorkspacePanelTabContentType): void => {
      const state = useAppStore.getState()
      if (panel === 'explorer') {
        state.showRightSidebarFiles()
      } else {
        state.setRightSidebarTab(panel)
      }
      activatePanel(panel)
    },
    [activatePanel]
  )
  const closePanel = useCallback((panel: WorkspacePanelTabContentType): void => {
    setOpenPanels((current) => current.filter((candidate) => candidate !== panel))
    setActivePanel((active) => (active === panel ? null : active))
  }, [])
  const selectSession = useCallback((): void => setActivePanel(null), [])

  // Why: app-menu and accelerator IPC still publish the shared panel route as
  // a one-shot request id; comparing it during render — rather than resetting
  // a ref in an effect — activates the requested panel exactly once per
  // request, remote workspaces included. See
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (previousRequestId !== panelRequestId) {
    setPreviousRequestId(panelRequestId)
    if (items.some((item) => item.id === requestedPanel)) {
      if (requestedPanel === 'source-control') {
        setSourceControlView(requestedSourceControlView)
      }
      activatePanel(requestedPanel)
    }
  }

  const checksState = useCoworkingChecksReadState(
    route,
    activePanel === 'source-control' && sourceControlView === 'review' && connected && supportsGit
  )
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const openItems = useMemo(
    () =>
      openPanels
        .map((panel) => itemById.get(panel))
        .filter((item): item is ActivityBarItem => item !== undefined),
    [itemById, openPanels]
  )

  return {
    activePanel,
    checksState,
    closePanel,
    items,
    openItems,
    openPanel,
    selectSession,
    setSourceControlView,
    sourceControlView
  }
}
