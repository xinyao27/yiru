import type {
  ExecutionHostId,
  PersistedTrustedYiruHooks,
  WorkspaceStatusDefinition
} from '../model/workspace.js'

export const RUNTIME_FEATURE_INTERACTION_IDS = [
  'workspace-agent-sessions',
  'cmd-j',
  'cmd-j-workspace-open',
  'cmd-j-browser-page-open',
  'cmd-j-settings-open',
  'cmd-j-quick-action',
  'cmd-j-create-workspace',
  'browser',
  'browser-tab-created',
  'browser-annotations',
  'browser-annotations-sent-to-agent',
  'browser-grab',
  'markdown-file-created',
  'workspace-creation',
  'agent-browser-setup',
  'agent-browser-use',
  'agent-orchestration-setup',
  'agent-orchestration',
  'mobile-emulator-agent-setup',
  'ai-commit-generation',
  'ai-pr-generation',
  'claude-account-switching',
  'computer-use-setup',
  'computer-use',
  'codex-account-switching',
  'cookie-import',
  'mobile-pairing',
  'notifications',
  'ports',
  'quick-commands',
  'resource-manager',
  'review-notes',
  'terminal-pane-split',
  'terminal-panes',
  'terminal-tabs',
  'tab-splits',
  'usage-tracking',
  'workspace-cleanup'
] as const

export const RUNTIME_FEATURE_TIP_IDS = ['yiru-cli', 'command-palette'] as const

export type RuntimeFeatureInteractionId = (typeof RUNTIME_FEATURE_INTERACTION_IDS)[number]
export type RuntimeFeatureTipId = (typeof RUNTIME_FEATURE_TIP_IDS)[number]
export type RuntimeContextualTourId = 'workspace-agent-sessions' | 'browser' | 'workspace-creation'
export type RuntimeWorktreeCardProperty =
  | 'status'
  | 'unread'
  | 'branch'
  | 'comment'
  | 'ports'
  | 'inline-agents'
export type RuntimeWorkspacePanelTabContentType =
  | 'explorer'
  | 'vault'
  | 'workspaces'
  | 'pr-checks'
  | 'source-control'
  | 'ports'
export type RuntimeWorkspaceTitlebarActionId =
  | RuntimeWorkspacePanelTabContentType
  | 'open-in'
  | 'commands'
export type RuntimeWorkspaceHostScope = 'all' | ExecutionHostId
export type RuntimeVisibleWorkspaceHostIds = Exclude<RuntimeWorkspaceHostScope, 'all'>[] | null
export type RuntimeWorkspaceHostOrder = Exclude<RuntimeWorkspaceHostScope, 'all'>[]
export type RuntimeFeatureInteractionRecord = {
  firstInteractedAt: number
  interactionCount: number
}
export type RuntimeFeatureInteractionState = Partial<
  Record<RuntimeFeatureInteractionId, RuntimeFeatureInteractionRecord>
>
export type RuntimeWorkspaceCleanupUIState = {
  dismissals: Record<
    string,
    {
      worktreeId: string
      dismissedAt: number
      fingerprint: string
      classifierVersion: number
    }
  >
}
export type RuntimeThemeGradientDotMode = 'wheel' | 'tint' | 'grayscale'
export type RuntimeThemeGradientHarmony =
  | 'floating'
  | 'complementary'
  | 'singleAnalogous'
  | 'splitComplementary'
  | 'analogous'
  | 'triadic'
export type RuntimeThemeGradientDot = {
  x: number
  y: number
  mode: RuntimeThemeGradientDotMode
  lightness: number
}
export type RuntimeThemeGradientTheme = {
  dots: RuntimeThemeGradientDot[]
  harmony: RuntimeThemeGradientHarmony
  opacity: number
  texture: number
}

export type RuntimePersistedUIState = {
  lastActiveRepoId: string | null
  lastActiveWorktreeId: string | null
  activeView: 'home' | 'terminal' | 'settings' | 'space' | 'skills' | 'mobile'
  sidebarWidth: number
  rightSidebarOpen: boolean
  rightSidebarTab: RuntimeWorkspacePanelTabContentType | 'search'
  rightSidebarExplorerView: 'files' | 'search'
  rightSidebarWidth: number
  markdownTocPanelWidth?: number
  groupBy: 'none' | 'workspace-status' | 'repo' | 'pr-status'
  sortBy: 'name' | 'smart' | 'recent' | 'repo' | 'manual'
  projectOrderBy: 'manual' | 'recent'
  showActiveOnly: boolean
  hideSleepingWorkspaces?: boolean
  workspaceHostScope?: RuntimeWorkspaceHostScope
  visibleWorkspaceHostIds?: RuntimeVisibleWorkspaceHostIds
  workspaceHostOrder?: RuntimeWorkspaceHostOrder
  manualRepoOrder?: { hostId: RuntimeWorkspaceHostOrder[number]; repoId: string }[]
  showSleepingWorkspaces?: boolean
  showInactiveWorkspaces?: boolean
  hideDefaultBranchWorkspace: boolean
  showDotfilesByWorktree?: Record<string, boolean>
  filterRepoIds: string[]
  collapsedGroups: string[]
  uiZoomLevel: number
  editorFontZoomLevel: number
  worktreeCardProperties: RuntimeWorktreeCardProperty[]
  agentActivityDisplayMode?: 'compact' | 'full'
  workspaceStatuses?: WorkspaceStatusDefinition[]
  _workspaceStatusesDefaultOrderMigrated?: boolean
  _workspaceStatusesReorderedDefaultRepaired?: boolean
  _workspaceStatusesDefaultWorkflowMigrated?: boolean
  _workspaceStatusesDefaultVisualsMigrated?: boolean
  _portsStatusBarDefaultAdded?: boolean
  _kimiStatusBarDefaultAdded?: boolean
  _minimaxStatusBarDefaultAdded?: boolean
  _antigravityStatusBarDefaultAdded?: boolean
  _grokStatusBarDefaultAdded?: boolean
  statusBarItems: (
    | 'claude'
    | 'codex'
    | 'cursor'
    | 'gemini'
    | 'antigravity'
    | 'opencode-go'
    | 'kimi'
    | 'minimax'
    | 'grok'
    | 'resource-usage'
    | 'ports'
  )[]
  statusBarVisible: boolean
  workspacePanelTitlebarPinnedIds?: RuntimeWorkspaceTitlebarActionId[]
  usagePercentageDisplay?: 'used' | 'remaining'
  statusBarUsageMode?: 'verbose' | 'compact'
  dismissedUpdateVersion: string | null
  lastUpdateCheckAt: number | null
  pendingUpdateNudgeId?: string | null
  dismissedUpdateNudgeId?: string | null
  notificationPermissionRequested?: boolean
  updateReassuranceSeen?: boolean
  acknowledgedAgentsByPaneKey?: Record<string, number>
  setupGuideSidebarDismissed?: boolean
  setupGuideBrowserMilestoneMigrated?: boolean
  setupGuideBrowserMilestoneLegacyComplete?: boolean
  browserImportHintHidden?: boolean
  trayMinimizeNoticeShown?: boolean
  mobileEmulatorTabIntroDismissed?: boolean
  mobileEmulatorAgentSetupDismissed?: boolean
  projectOrderManualDefaultNoticeDismissed?: boolean
  usagePercentageDisplayChangeNoticeDismissed?: boolean
  usageEmptyStateDismissed?: boolean
  browserDefaultUrl?: string | null
  browserDefaultSearchEngine?: 'google' | 'duckduckgo' | 'bing' | 'kagi' | null
  browserDefaultZoomLevel?: number
  browserKagiSessionLink?: string | null
  windowBounds?: { x: number; y: number; width: number; height: number } | null
  windowMaximized?: boolean
  _sortBySmartMigrated?: boolean
  _inlineAgentsDefaultedForExperiment?: boolean
  _inlineAgentsDefaultedForAllUsers?: boolean
  _expandedWorktreeCardPropertiesDefaulted?: boolean
  starNagBaselineAgents?: number | null
  starNagAppVersion?: string | null
  starNagNextThreshold?: number
  starNagCompleted?: boolean
  starNagDeferredUntil?: number | null
  starNagAgentValueMomentAppVersion?: string | null
  trustedYiruHooks?: PersistedTrustedYiruHooks
  themeGradientDefault?: RuntimeThemeGradientTheme | null
  themeGradientsByWorkspaceId?: Record<string, RuntimeThemeGradientTheme>
  setupScriptPromptDismissedRepoIds?: string[]
  workspaceCleanup?: RuntimeWorkspaceCleanupUIState
  featureTipsSeenIds?: RuntimeFeatureTipId[]
  featureInteractions?: RuntimeFeatureInteractionState
  contextualToursSeenIds?: RuntimeContextualTourId[]
  contextualToursAutoEligible?: boolean
}

export type RuntimeUIResult = { ui: RuntimePersistedUIState }
