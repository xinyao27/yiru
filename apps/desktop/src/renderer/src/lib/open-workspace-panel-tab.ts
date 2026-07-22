import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import type { WorkspacePanelTabContentType } from '../../../shared/types'

type ExplorerDestination =
  | { view: 'files' }
  | {
      view: 'search'
      query?: string
      includePattern?: string
    }

const getWorkspacePanelTabLabel = (panel: WorkspacePanelTabContentType): string => {
  switch (panel) {
    case 'explorer':
      return translate('auto.components.right.sidebar.index.8bc2bbc3a0', 'Explorer')
    case 'vault':
      return translate('auto.components.right.sidebar.index.aiVaultSessionHistory', 'Agents')
    case 'workspaces':
      return translate('auto.components.right.sidebar.index.folderWorkspaces', 'Attached worktrees')
    case 'pr-checks':
      return translate('auto.components.right.sidebar.index.parentPrChecks', 'PR Checks')
    case 'source-control':
      return translate('auto.components.right.sidebar.index.0314901467', 'Source Control')
    case 'checks':
      return translate('auto.components.right.sidebar.index.83a10e3c44', 'Checks')
    case 'ports':
      return translate('auto.components.right.sidebar.index.441733b630', 'Ports')
  }
}

export function openWorkspacePanelTab({
  panel,
  worktreeId,
  groupId,
  explorerDestination
}: {
  panel: WorkspacePanelTabContentType
  worktreeId?: string | null
  groupId?: string | null
  explorerDestination?: ExplorerDestination
}): void {
  const state = useAppStore.getState()
  const resolvedWorktreeId = worktreeId ?? state.activeWorktreeId
  if (!resolvedWorktreeId) {
    return
  }
  const resolvedGroupId = groupId ?? state.activeGroupIdByWorktree[resolvedWorktreeId] ?? undefined
  const existingTab = (state.unifiedTabsByWorktree[resolvedWorktreeId] ?? []).find(
    (tab) => tab.groupId === resolvedGroupId && tab.contentType === panel
  )
  const tab =
    existingTab ??
    state.createUnifiedTab(resolvedWorktreeId, panel, {
      entityId: panel,
      label: getWorkspacePanelTabLabel(panel),
      targetGroupId: resolvedGroupId
    })

  // Why: legacy panel internals still share explorer route and polling state;
  // the visible shell is now a tab, while these values remain their data route.
  if (panel === 'explorer' && explorerDestination?.view === 'search') {
    state.showRightSidebarSearch({
      ...(explorerDestination.query ? { query: explorerDestination.query } : {}),
      ...(explorerDestination.includePattern
        ? { includePattern: explorerDestination.includePattern }
        : {})
    })
  } else if (panel === 'explorer') {
    state.showRightSidebarFiles()
  } else {
    state.setRightSidebarTab(panel)
    state.setRightSidebarOpen(true)
  }

  state.focusGroup(resolvedWorktreeId, tab.groupId)
  state.activateTab(tab.id)
}
