import { getDefaultUIState, normalizeWorktreeCardProperties } from '../../shared/constants'
import { isExistingPersistedProfile } from '../../shared/project-order-manual-default-notice'
import type { GlobalSettings, OnboardingState, PersistedState } from '../../shared/types'
import { resolveUsagePercentageDisplayChangeNoticeDismissed } from '../../shared/usage-percentage-display-change-notice'
import { normalizePersistedWorkspaceStatuses } from '../../shared/workspace-statuses'
import {
  normalizePersistedRightSidebarTab,
  normalizePersistedShowDotfiles,
  normalizePersistedSortBy,
  stripReservedPersistedUiState
} from './persisted-ui-normalizers'

export type PersistedUiCodecContext = {
  onboarding: OnboardingState
  repoCount: number
  legacyInlineAgentsExperimentEnabled: boolean
}

export type PersistedUiDecodeResult = {
  ui: PersistedState['ui']
  needsSave: boolean
}

function migrateWorktreeCardProperties(
  value: Partial<PersistedState['ui']> | undefined,
  legacyExperimentEnabled: boolean
): { properties?: PersistedState['ui']['worktreeCardProperties']; needsSave: boolean } {
  const raw = value?.worktreeCardProperties
  const inlineAgentsMigrated = value?._inlineAgentsDefaultedForAllUsers === true
  const expandedPropertiesMigrated = value?._expandedWorktreeCardPropertiesDefaulted === true
  const deliberateUncheck =
    legacyExperimentEnabled && Array.isArray(raw) && !raw.includes('inline-agents')
  const needsInlineAgents =
    !inlineAgentsMigrated &&
    !deliberateUncheck &&
    Array.isArray(raw) &&
    !raw.includes('inline-agents')
  if (!Array.isArray(raw)) {
    return {
      needsSave: !inlineAgentsMigrated || !expandedPropertiesMigrated
    }
  }
  const withInlineAgents = needsInlineAgents ? [...raw, 'inline-agents' as const] : raw
  const withExpandedProperties = expandedPropertiesMigrated
    ? withInlineAgents
    : withInlineAgents.includes('ports')
      ? withInlineAgents
      : [...withInlineAgents, 'ports' as const]
  const normalized = normalizeWorktreeCardProperties(withExpandedProperties)
  const changed =
    normalized.length !== raw.length ||
    normalized.some((property, index) => property !== raw[index])
  return {
    ...(changed ? { properties: normalized } : {}),
    needsSave: changed || !inlineAgentsMigrated || !expandedPropertiesMigrated
  }
}

export function decodePersistedUi(
  value: Partial<PersistedState['ui']> | undefined,
  legacySettings: Partial<GlobalSettings> | undefined,
  context: PersistedUiCodecContext
): PersistedUiDecodeResult {
  const defaults = getDefaultUIState()
  const rawSort = value?.sortBy
  const migrateSmartSort = value?._sortBySmartMigrated !== true && rawSort === 'recent'
  const hasExplicitRightSidebarState = typeof value?.rightSidebarOpen === 'boolean'
  const rightSidebarOpen = hasExplicitRightSidebarState
    ? (value?.rightSidebarOpen as boolean)
    : typeof legacySettings?.rightSidebarOpenByDefault === 'boolean'
      ? legacySettings.rightSidebarOpenByDefault
      : defaults.rightSidebarOpen
  const defaultOrderMigrated = value?._workspaceStatusesDefaultOrderMigrated === true
  const reorderedDefaultRepaired = value?._workspaceStatusesReorderedDefaultRepaired === true
  const defaultWorkflowMigrated = value?._workspaceStatusesDefaultWorkflowMigrated === true
  const defaultVisualsMigrated = value?._workspaceStatusesDefaultVisualsMigrated === true
  const workspaceStatuses = normalizePersistedWorkspaceStatuses(value?.workspaceStatuses, {
    migrateDefaultWorkflowStatuses: !defaultWorkflowMigrated,
    repairReorderedDefaultStatuses: !reorderedDefaultRepaired,
    migrateLegacyDefaultStatusVisuals: !defaultVisualsMigrated
  })
  const cardProperties = migrateWorktreeCardProperties(
    value,
    context.legacyInlineAgentsExperimentEnabled
  )
  const setupGuideSidebarDismissed =
    context.onboarding.closedAt !== null || value?.setupGuideSidebarDismissed === true
  const usageNoticeDismissed = resolveUsagePercentageDisplayChangeNoticeDismissed({
    rawDismissed: value?.usagePercentageDisplayChangeNoticeDismissed,
    rawUsagePercentageDisplay: value?.usagePercentageDisplay,
    isExistingProfile: isExistingPersistedProfile({
      repoCount: context.repoCount,
      onboardingClosedAt: context.onboarding.closedAt,
      ui: value
    })
  })
  const hadRetiredCardMarker = Object.hasOwn(value ?? {}, '_worktreeCardModeDefaulted')
  const setupGuideStateChanged =
    value?.setupGuideSidebarDismissed !== setupGuideSidebarDismissed &&
    (setupGuideSidebarDismissed || value?.setupGuideSidebarDismissed !== undefined)

  return {
    ui: {
      ...defaults,
      ...stripReservedPersistedUiState(value),
      rightSidebarOpen,
      rightSidebarTab: normalizePersistedRightSidebarTab(value?.rightSidebarTab),
      setupGuideSidebarDismissed,
      usagePercentageDisplayChangeNoticeDismissed: usageNoticeDismissed,
      setupGuideBrowserMilestoneMigrated:
        typeof value?.setupGuideBrowserMilestoneMigrated === 'boolean'
          ? value.setupGuideBrowserMilestoneMigrated
          : false,
      setupGuideBrowserMilestoneLegacyComplete:
        value?.setupGuideBrowserMilestoneLegacyComplete === true,
      sortBy: migrateSmartSort ? 'smart' : normalizePersistedSortBy(rawSort),
      showDotfilesByWorktree: normalizePersistedShowDotfiles(value?.showDotfilesByWorktree),
      workspaceStatuses,
      _workspaceStatusesDefaultOrderMigrated: true,
      _workspaceStatusesReorderedDefaultRepaired: true,
      _workspaceStatusesDefaultWorkflowMigrated: true,
      _workspaceStatusesDefaultVisualsMigrated: true,
      _sortBySmartMigrated: true,
      ...(cardProperties.properties ? { worktreeCardProperties: cardProperties.properties } : {}),
      _inlineAgentsDefaultedForExperiment: true,
      _inlineAgentsDefaultedForAllUsers: true,
      _expandedWorktreeCardPropertiesDefaulted: true
    },
    needsSave:
      migrateSmartSort ||
      !hasExplicitRightSidebarState ||
      !defaultOrderMigrated ||
      !reorderedDefaultRepaired ||
      !defaultWorkflowMigrated ||
      !defaultVisualsMigrated ||
      hadRetiredCardMarker ||
      cardProperties.needsSave ||
      setupGuideStateChanged ||
      value?.usagePercentageDisplayChangeNoticeDismissed !== usageNoticeDismissed
  }
}
