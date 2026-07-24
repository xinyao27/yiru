import {
  normalizeExecutionHostOrder,
  normalizeVisibleExecutionHostIds
} from '@yiru/workbench-model/workspace'

import { normalizeBrowserPageZoomLevel } from '../../shared/browser-page-zoom'
import {
  getDefaultUIState,
  normalizeAgentActivityDisplayMode,
  normalizeWorktreeCardProperties
} from '../../shared/constants'
import { normalizeContextualTourIds } from '../../shared/contextual-tours'
import { normalizeFeatureInteractions } from '../../shared/feature-interactions'
import { normalizeFeatureTipIds } from '../../shared/feature-tips'
import { normalizeManualRepoOrder } from '../../shared/manual-repo-order'
import { clampMarkdownTocPanelWidth } from '../../shared/markdown-toc-panel-width'
import { persistedUIValuesEqual } from '../../shared/persisted-ui-equality'
import { normalizeStatusBarUsageMode } from '../../shared/status-bar-usage-mode'
import type { PersistedState } from '../../shared/types'
import { normalizeUsagePercentageDisplay } from '../../shared/usage-percentage-display'
import { normalizeWorkspaceStatuses } from '../../shared/workspace-statuses'
import {
  mergePersistedContextualTours,
  mergePersistedFeatureInteractions,
  normalizePersistedGroupBy,
  normalizePersistedProjectOrderBy,
  normalizePersistedRightSidebarExplorerView,
  normalizePersistedRightSidebarTab,
  normalizePersistedShowDotfiles,
  normalizePersistedSortBy,
  stripReservedPersistedUiState
} from './persisted-ui-normalizers'

type PersistedUi = PersistedState['ui']

export type PersistedUiMutation = {
  ui: PersistedUi
  changed: boolean
}

export function readPersistedUi(value: PersistedUi): PersistedUi {
  return {
    ...getDefaultUIState(),
    ...stripReservedPersistedUiState(value),
    groupBy: normalizePersistedGroupBy(value?.groupBy),
    sortBy: normalizePersistedSortBy(value?.sortBy),
    projectOrderBy: normalizePersistedProjectOrderBy(value?.projectOrderBy),
    rightSidebarTab: normalizePersistedRightSidebarTab(value?.rightSidebarTab),
    rightSidebarExplorerView: normalizePersistedRightSidebarExplorerView(
      value?.rightSidebarExplorerView,
      value?.rightSidebarTab
    ),
    worktreeCardProperties: normalizeWorktreeCardProperties(value?.worktreeCardProperties),
    agentActivityDisplayMode: normalizeAgentActivityDisplayMode(value?.agentActivityDisplayMode),
    workspaceStatuses: normalizeWorkspaceStatuses(value?.workspaceStatuses),
    usagePercentageDisplay: normalizeUsagePercentageDisplay(value?.usagePercentageDisplay),
    statusBarUsageMode: normalizeStatusBarUsageMode(value?.statusBarUsageMode),
    trayMinimizeNoticeShown: value?.trayMinimizeNoticeShown === true,
    markdownTocPanelWidth: clampMarkdownTocPanelWidth(value?.markdownTocPanelWidth),
    visibleWorkspaceHostIds: normalizeVisibleExecutionHostIds(value?.visibleWorkspaceHostIds),
    workspaceHostOrder: normalizeExecutionHostOrder(value?.workspaceHostOrder),
    manualRepoOrder: normalizeManualRepoOrder(value?.manualRepoOrder),
    browserDefaultZoomLevel: normalizeBrowserPageZoomLevel(value?.browserDefaultZoomLevel),
    showDotfilesByWorktree: normalizePersistedShowDotfiles(value?.showDotfilesByWorktree),
    featureTipsSeenIds: normalizeFeatureTipIds(value?.featureTipsSeenIds),
    contextualToursSeenIds: normalizeContextualTourIds(value?.contextualToursSeenIds),
    featureInteractions: normalizeFeatureInteractions(value?.featureInteractions)
  }
}

export function applyPersistedUiUpdate(
  current: PersistedUi,
  updates: Partial<PersistedUi>
): PersistedUiMutation {
  const previous = readPersistedUi(current)
  const normalizedUpdates = stripReservedPersistedUiState(updates)
  const currentWithDefaults = { ...getDefaultUIState(), ...stripReservedPersistedUiState(current) }
  const rightSidebarTab =
    normalizedUpdates.rightSidebarTab !== undefined
      ? normalizePersistedRightSidebarTab(normalizedUpdates.rightSidebarTab)
      : normalizePersistedRightSidebarTab(current?.rightSidebarTab)
  const rightSidebarExplorerView =
    normalizedUpdates.rightSidebarExplorerView !== undefined
      ? normalizePersistedRightSidebarExplorerView(
          normalizedUpdates.rightSidebarExplorerView,
          rightSidebarTab
        )
      : normalizedUpdates.rightSidebarTab === 'search'
        ? 'search'
        : normalizePersistedRightSidebarExplorerView(
            current?.rightSidebarExplorerView,
            rightSidebarTab
          )
  const ui: PersistedUi = {
    ...currentWithDefaults,
    ...normalizedUpdates,
    groupBy: normalizedUpdates.groupBy
      ? normalizePersistedGroupBy(normalizedUpdates.groupBy)
      : normalizePersistedGroupBy(current?.groupBy),
    sortBy: normalizedUpdates.sortBy
      ? normalizePersistedSortBy(normalizedUpdates.sortBy)
      : normalizePersistedSortBy(current?.sortBy),
    projectOrderBy: updates.projectOrderBy
      ? normalizePersistedProjectOrderBy(updates.projectOrderBy)
      : normalizePersistedProjectOrderBy(current?.projectOrderBy),
    rightSidebarTab,
    rightSidebarExplorerView,
    worktreeCardProperties:
      normalizedUpdates.worktreeCardProperties !== undefined
        ? normalizeWorktreeCardProperties(normalizedUpdates.worktreeCardProperties)
        : normalizeWorktreeCardProperties(current?.worktreeCardProperties),
    agentActivityDisplayMode:
      updates.agentActivityDisplayMode !== undefined
        ? normalizeAgentActivityDisplayMode(updates.agentActivityDisplayMode)
        : normalizeAgentActivityDisplayMode(current?.agentActivityDisplayMode),
    workspaceStatuses:
      normalizedUpdates.workspaceStatuses !== undefined
        ? normalizeWorkspaceStatuses(normalizedUpdates.workspaceStatuses)
        : normalizeWorkspaceStatuses(current?.workspaceStatuses),
    usagePercentageDisplay: normalizeUsagePercentageDisplay(
      normalizedUpdates.usagePercentageDisplay ?? current?.usagePercentageDisplay
    ),
    statusBarUsageMode: normalizeStatusBarUsageMode(
      normalizedUpdates.statusBarUsageMode ?? current?.statusBarUsageMode
    ),
    markdownTocPanelWidth: clampMarkdownTocPanelWidth(
      normalizedUpdates.markdownTocPanelWidth ?? current?.markdownTocPanelWidth
    ),
    visibleWorkspaceHostIds:
      updates.visibleWorkspaceHostIds !== undefined
        ? normalizeVisibleExecutionHostIds(updates.visibleWorkspaceHostIds)
        : normalizeVisibleExecutionHostIds(current?.visibleWorkspaceHostIds),
    workspaceHostOrder:
      updates.workspaceHostOrder !== undefined
        ? normalizeExecutionHostOrder(updates.workspaceHostOrder)
        : normalizeExecutionHostOrder(current?.workspaceHostOrder),
    manualRepoOrder:
      updates.manualRepoOrder !== undefined
        ? normalizeManualRepoOrder(updates.manualRepoOrder)
        : normalizeManualRepoOrder(current?.manualRepoOrder),
    browserDefaultZoomLevel: normalizeBrowserPageZoomLevel(
      updates.browserDefaultZoomLevel ?? current?.browserDefaultZoomLevel
    ),
    showDotfilesByWorktree:
      updates.showDotfilesByWorktree !== undefined
        ? normalizePersistedShowDotfiles(updates.showDotfilesByWorktree)
        : normalizePersistedShowDotfiles(current?.showDotfilesByWorktree),
    featureTipsSeenIds:
      normalizedUpdates.featureTipsSeenIds !== undefined
        ? normalizeFeatureTipIds(normalizedUpdates.featureTipsSeenIds)
        : normalizeFeatureTipIds(current?.featureTipsSeenIds),
    contextualToursSeenIds:
      updates.contextualToursSeenIds !== undefined
        ? mergePersistedContextualTours(
            current?.contextualToursSeenIds,
            updates.contextualToursSeenIds
          )
        : normalizeContextualTourIds(current?.contextualToursSeenIds),
    featureInteractions:
      normalizedUpdates.featureInteractions !== undefined
        ? mergePersistedFeatureInteractions(
            current?.featureInteractions,
            normalizedUpdates.featureInteractions
          )
        : normalizeFeatureInteractions(current?.featureInteractions)
  }
  return { ui, changed: !persistedUIValuesEqual(previous, ui) }
}
