// Bi-directional mapping between the mobile workspaces screen's local view model
// and the desktop's shared PersistedUIState (read/written via the ui.get/ui.set
// RPCs). Keeping these settings in the same global store is what lets a grouping
// or filter change on the phone show up on desktop and vice-versa.

import type { WorkspaceStatusDefinition } from '@yiru/workbench-model/workspace'

import { coerceMobileWorkspaceStatuses } from './workspace-statuses'

export type MobileGroupMode = 'none' | 'workspaceStatus' | 'repo' | 'prStatus'
// Desktop sort adds 'manual'; mobile renders it but sorts by server order.
export type MobileSortMode = 'smart' | 'name' | 'recent' | 'repo' | 'manual'

// Desktop PersistedUIState fields this screen syncs (a structural subset).
export type WorkspaceViewSettings = {
  groupBy?: 'none' | 'workspace-status' | 'repo' | 'pr-status'
  sortBy?: 'name' | 'smart' | 'recent' | 'repo' | 'manual'
  hideSleepingWorkspaces?: boolean
  hideDefaultBranchWorkspace?: boolean
  filterRepoIds?: string[]
  collapsedGroups?: string[]
  workspaceStatuses?: WorkspaceStatusDefinition[]
}

const SORT_VALUES: readonly MobileSortMode[] = ['smart', 'name', 'recent', 'repo', 'manual']

export function sortModeFromDesktop(
  sortBy: WorkspaceViewSettings['sortBy']
): MobileSortMode | null {
  return sortBy && SORT_VALUES.includes(sortBy) ? sortBy : null
}

export type MobileViewState = {
  groupMode: MobileGroupMode
  sortMode: MobileSortMode
  hideSleeping: boolean
  hideDefaultBranch: boolean
  filterRepoIds: string[]
  collapsedGroups: string[]
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
}

// Apply a desktop PersistedUIState onto the local view state, leaving any field
// the desktop hasn't set untouched (so a partial ui.get doesn't clobber).
export function applyDesktopViewSettings(
  current: MobileViewState,
  settings: WorkspaceViewSettings
): MobileViewState {
  const sortMode = sortModeFromDesktop(settings.sortBy)
  // Why: a partially hydrated desktop settings payload may carry an empty
  // status catalog; mobile must keep renderable groups instead of hiding rows.
  const workspaceStatuses = settings.workspaceStatuses
    ? coerceMobileWorkspaceStatuses(settings.workspaceStatuses)
    : current.workspaceStatuses
  const next: MobileViewState = {
    // Why: Project -> Workspace is the one list hierarchy on desktop and mobile;
    // legacy synced grouping values must not restore the retired switcher.
    groupMode: 'repo',
    sortMode: sortMode ?? current.sortMode,
    hideSleeping: settings.hideSleepingWorkspaces ?? current.hideSleeping,
    hideDefaultBranch: settings.hideDefaultBranchWorkspace ?? current.hideDefaultBranch,
    filterRepoIds: settings.filterRepoIds ?? current.filterRepoIds,
    collapsedGroups: settings.collapsedGroups ?? current.collapsedGroups,
    workspaceStatuses
  }
  return next
}
