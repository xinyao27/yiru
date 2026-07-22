import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar-buttons'
import { createRightSidebarActivityItems } from '@/components/right-sidebar/right-sidebar-activity-items'
import { getVisibleRightSidebarActivityItems } from '@/components/right-sidebar/right-sidebar-activity-visibility'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { useAppStore } from '@/store'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import { useSpoolChecksReadState, type SpoolChecksReadState } from './spool-checks-pane'

export type SpoolWorkspacePanelTabs = {
  activePanel: WorkspacePanelTabContentType | null
  checksState: SpoolChecksReadState
  closePanel: (panel: WorkspacePanelTabContentType) => void
  items: readonly ActivityBarItem[]
  openItems: readonly ActivityBarItem[]
  openPanel: (panel: WorkspacePanelTabContentType) => void
  selectSession: () => void
}

export function useSpoolWorkspacePanelTabs({
  route,
  connected,
  supportsGit
}: {
  route: SpoolWorkspaceRoute
  connected: boolean
  supportsGit: boolean
}): SpoolWorkspacePanelTabs {
  const explorerShortcut = useShortcutLabel('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutLabel('sidebar.sourceControl.toggle')
  const checksShortcut = useShortcutLabel('sidebar.checks.toggle')
  const portsShortcut = useShortcutLabel('sidebar.ports.toggle')
  const requestedPanel = useAppStore((state) => state.rightSidebarTab)
  const panelRequestId = useAppStore((state) => state.rightSidebarRouteRequestId)
  const previousRequestIdRef = useRef(panelRequestId)
  const [activePanel, setActivePanel] = useState<WorkspacePanelTabContentType | null>(null)
  const [openPanels, setOpenPanels] = useState<readonly WorkspacePanelTabContentType[]>([])
  const items = useMemo(
    () =>
      getVisibleRightSidebarActivityItems(
        createRightSidebarActivityItems({
          explorer: explorerShortcut,
          sourceControl: sourceControlShortcut,
          checks: checksShortcut,
          ports: portsShortcut
        }),
        { isFolder: !supportsGit, isFolderWorkspace: false, isSshRepo: false }
      ),
    [checksShortcut, explorerShortcut, portsShortcut, sourceControlShortcut, supportsGit]
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

  useEffect(() => {
    // Why: app-menu and accelerator IPC still publish the shared panel route;
    // remote workspaces translate each new request into a real local tab.
    if (previousRequestIdRef.current === panelRequestId) {
      return
    }
    previousRequestIdRef.current = panelRequestId
    if (items.some((item) => item.id === requestedPanel)) {
      activatePanel(requestedPanel)
    }
  }, [activatePanel, items, panelRequestId, requestedPanel])

  const checksState = useSpoolChecksReadState(
    route,
    activePanel === 'checks' && connected && supportsGit
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
    selectSession
  }
}
