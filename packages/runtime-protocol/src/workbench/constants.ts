import { DEFAULT_BROWSER_PAGE_ZOOM_LEVEL } from './browser/page-zoom'
import { getDefaultSettings } from './default-settings'
import { DEFAULT_SETUP_AGENT_STARTUP_POLICY } from './setup/agent-startup-policy'
import { DEFAULT_STATUS_BAR_ITEMS } from './status-bar-defaults'
import { DEFAULT_STATUS_BAR_USAGE_MODE } from './status-bar-usage-mode'
import type {
  AgentActivityDisplayMode,
  OnboardingChecklistState,
  OnboardingState,
  PersistedState,
  PersistedUIState,
  RepoHookSettings,
  WorkspaceSessionState
} from './types'
import { DEFAULT_USAGE_PERCENTAGE_DISPLAY } from './usage-percentage-display'
import { DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS } from './workspace/panel-titlebar-pinned'
import { cloneDefaultWorkspaceStatuses } from './workspace/statuses'
import { DEFAULT_WORKTREE_CARD_PROPERTIES } from './workspace/worktree-card-properties'

export {
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_EDITOR_AUTO_SAVE_DELAY_MS,
  getDefaultNotificationSettings,
  getDefaultSettings,
  getDefaultTerminalRightClickToPaste,
  MAX_EDITOR_AUTO_SAVE_DELAY_MS,
  MIN_EDITOR_AUTO_SAVE_DELAY_MS
} from './default-settings'
export { DEFAULT_STATUS_BAR_ITEMS } from './status-bar-defaults'
export {
  DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS,
  normalizeWorkspacePanelTitlebarPinnedIds
} from './workspace/panel-titlebar-pinned'
export {
  DEFAULT_WORKTREE_CARD_PROPERTIES,
  normalizeWorktreeCardProperties
} from './workspace/worktree-card-properties'

export const SCHEMA_VERSION = 1
export const DEFAULT_SHOW_SLEEPING_WORKSPACES = true
export const DEFAULT_HIDE_SLEEPING_WORKSPACES = false
export const DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE: AgentActivityDisplayMode = 'compact'

export function normalizeAgentActivityDisplayMode(value: unknown): AgentActivityDisplayMode {
  return value === 'full' || value === 'compact' ? value : DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
}

// Why: clamps and UI step references must agree on the onboarding boundary.
export const ONBOARDING_FINAL_STEP = 5
export const ONBOARDING_FLOW_VERSION = 4

export const YIRU_BROWSER_PARTITION = 'persist:yiru-browser'
// Why: marketplace browsing must not share the user's browser-pane cookies.
export const SKILLS_MARKETPLACE_PARTITION = 'persist:skills-marketplace'
// Why: the host attach policy allows this exact inert guest URL only.
export const YIRU_BROWSER_BLANK_URL = 'data:text/html,'

export const BROWSER_FAMILY_LABELS: Record<string, string> = {
  chrome: 'Google Chrome',
  chromium: 'Chromium',
  comet: 'Comet',
  helium: 'Helium',
  arc: 'Arc',
  edge: 'Microsoft Edge',
  brave: 'Brave',
  firefox: 'Firefox',
  safari: 'Safari',
  manual: 'File'
}

/**
 * Why: ProseMirror eagerly builds the whole document tree. Larger markdown
 * files use Monaco's virtualized source mode to avoid typing lag.
 */
export const RICH_MARKDOWN_MAX_SIZE_BYTES = 300 * 1024

// Why: this doubles after each dismissal; the persisted threshold records it.
export const STAR_NAG_INITIAL_THRESHOLD = 35

// Why: main and renderer need one bucket for PTYs without a worktree.
export const ORPHAN_WORKTREE_ID = '__orphan__'

export const REPO_COLORS = [
  '#737373',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#8b5cf6',
  '#ec4899'
] as const

export const DEFAULT_REPO_BADGE_COLOR = REPO_COLORS[0]

export function getDefaultOnboardingState(): OnboardingState {
  return {
    flowVersion: ONBOARDING_FLOW_VERSION,
    closedAt: null,
    outcome: null,
    lastCompletedStep: -1,
    checklist: {
      addedRepo: false,
      choseAgent: false,
      ranFirstAgent: false,
      ranSecondAgentOnSameTask: false,
      triedCmdJ: false,
      shapedSidebar: false,
      reviewedDiff: false,
      openedPr: false,
      addedFolder: false,
      openedFile: false,
      ranAgentOnFile: false,
      dismissed: false
    } satisfies OnboardingChecklistState
  }
}

export function getDefaultRepoHookSettings(): RepoHookSettings {
  return {
    mode: 'auto',
    setupRunPolicy: 'run-by-default',
    setupAgentStartupPolicy: DEFAULT_SETUP_AGENT_STARTUP_POLICY,
    scripts: {
      setup: '',
      archive: ''
    }
  }
}

export function getDefaultPersistedState(homedir: string): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    repos: [],
    projects: [],
    projectHostSetups: [],
    projectGroups: [],
    folderWorkspaces: [],
    sparsePresetsByRepo: {},
    worktreeMeta: {},
    worktreeLineageById: {},
    workspaceLineageByChildKey: {},
    settings: getDefaultSettings(homedir),
    ui: getDefaultUIState(),
    githubCache: { pr: {} },
    workspaceSession: getDefaultWorkspaceSession(),
    workspaceSessionsByHostId: {},
    claudeLivePtySessionIds: [],
    migrationUnsupportedPtyEntries: [],
    legacyPaneKeyAliasEntries: [],
    rateLimitResumes: [],
    onboarding: getDefaultOnboardingState(),
    featureInteractionTelemetryBuckets: {}
  }
}

export function getDefaultUIState(): PersistedUIState {
  return {
    lastActiveRepoId: null,
    lastActiveWorktreeId: null,
    activeView: 'terminal',
    sidebarWidth: 280,
    rightSidebarOpen: true,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    rightSidebarWidth: 350,
    markdownTocPanelWidth: 240,
    groupBy: 'repo',
    sortBy: 'recent',
    projectOrderBy: 'manual',
    showActiveOnly: false,
    hideSleepingWorkspaces: DEFAULT_HIDE_SLEEPING_WORKSPACES,
    workspaceHostScope: 'all',
    visibleWorkspaceHostIds: null,
    workspaceHostOrder: [],
    manualRepoOrder: [],
    showSleepingWorkspaces: DEFAULT_SHOW_SLEEPING_WORKSPACES,
    hideDefaultBranchWorkspace: false,
    showDotfilesByWorktree: {},
    filterRepoIds: [],
    collapsedGroups: [],
    uiZoomLevel: 0,
    editorFontZoomLevel: 0,
    worktreeCardProperties: [...DEFAULT_WORKTREE_CARD_PROPERTIES],
    agentActivityDisplayMode: DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE,
    workspaceStatuses: cloneDefaultWorkspaceStatuses(),
    _workspaceStatusesDefaultOrderMigrated: true,
    _workspaceStatusesReorderedDefaultRepaired: true,
    _workspaceStatusesDefaultWorkflowMigrated: true,
    _workspaceStatusesDefaultVisualsMigrated: true,
    statusBarItems: [...DEFAULT_STATUS_BAR_ITEMS],
    statusBarVisible: true,
    workspacePanelTitlebarPinnedIds: [...DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS],
    usagePercentageDisplay: DEFAULT_USAGE_PERCENTAGE_DISPLAY,
    statusBarUsageMode: DEFAULT_STATUS_BAR_USAGE_MODE,
    dismissedUpdateVersion: null,
    lastUpdateCheckAt: null,
    trustedYiruHooks: {},
    setupScriptPromptDismissedRepoIds: [],
    acknowledgedAgentsByPaneKey: {},
    setupGuideSidebarDismissed: false,
    setupGuideBrowserMilestoneMigrated: true,
    setupGuideBrowserMilestoneLegacyComplete: false,
    browserImportHintHidden: false,
    trayMinimizeNoticeShown: false,
    mobileEmulatorTabIntroDismissed: false,
    mobileEmulatorAgentSetupDismissed: false,
    projectOrderManualDefaultNoticeDismissed: true,
    usagePercentageDisplayChangeNoticeDismissed: true,
    workspaceCleanup: { dismissals: {} },
    featureTipsSeenIds: [],
    featureInteractions: {},
    contextualToursSeenIds: [],
    browserDefaultZoomLevel: DEFAULT_BROWSER_PAGE_ZOOM_LEVEL
  }
}

export function getDefaultWorkspaceSession(): WorkspaceSessionState {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    openFilesByWorktree: {},
    markdownFrontmatterVisible: {},
    browserTabsByWorktree: {},
    browserPagesByWorkspace: {},
    activeBrowserTabIdByWorktree: {},
    activeFileIdByWorktree: {},
    activeTabTypeByWorktree: {},
    browserUrlHistory: [],
    defaultTerminalTabsAppliedByWorktreeId: {}
  }
}
