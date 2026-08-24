import type { YiruHookScriptKind } from '~renderer/components/sidebar/yiru-hook-trust'
import type { StatusBarUsageMode } from '~shared/status-bar-usage-mode'
import type {
  ManualRepoOrderEntry,
  PersistedTrustedYiruHooks,
  StatusBarItem,
  WorkspaceTitlebarActionId,
  WorkspaceStatusDefinition,
  AgentActivityDisplayMode,
  ProjectOrderBy,
  WorktreeCardProperty,
  WorkspaceHostOrder,
  WorkspaceHostScope,
  VisibleWorkspaceHostIds
} from '~shared/types'
import type { UsagePercentageDisplay } from '~shared/usage-percentage-display'

export type UIWorkspaceState = {
  trustedYiruHooks: PersistedTrustedYiruHooks
  markYiruHookScriptConfirmed: (
    repoId: string,
    kind: YiruHookScriptKind,
    contentHash: string
  ) => void
  markYiruHookRepoAlwaysTrusted: (repoId: string) => void
  clearYiruHookTrustForRepo: (repoId: string) => void
  setupScriptPromptDismissedRepoIds: string[]
  dismissSetupScriptPrompt: (repoId: string) => void
  setupGuideSidebarDismissed: boolean
  setSetupGuideSidebarDismissed: (dismissed: boolean) => void
  setupGuideBrowserMilestoneMigrated: boolean
  setupGuideBrowserMilestoneLegacyComplete: boolean
  markSetupGuideBrowserMilestoneMigrated: (legacyComplete: boolean) => void
  browserImportHintHidden: boolean
  setBrowserImportHintHidden: (hidden: boolean) => void
  mobileEmulatorTabIntroDismissed: boolean
  dismissMobileEmulatorTabIntro: () => void
  mobileEmulatorAgentSetupDismissed: boolean
  dismissMobileEmulatorAgentSetup: () => void
  projectOrderManualDefaultNoticeDismissed: boolean
  dismissProjectOrderManualDefaultNotice: () => void
  usagePercentageDisplayChangeNoticeDismissed: boolean
  dismissUsagePercentageDisplayChangeNotice: () => void
  usageEmptyStateDismissed: boolean
  dismissUsageEmptyState: () => void
  groupBy: 'none' | 'workspace-status' | 'repo' | 'pr-status'
  setGroupBy: (g: UIWorkspaceState['groupBy']) => void
  sortBy: 'name' | 'smart' | 'recent' | 'repo' | 'manual'
  setSortBy: (s: UIWorkspaceState['sortBy']) => void
  projectOrderBy: ProjectOrderBy
  setProjectOrderBy: (p: ProjectOrderBy) => void
  showActiveOnly: boolean
  setShowActiveOnly: (v: boolean) => void
  showSleepingWorkspaces: boolean
  setShowSleepingWorkspaces: (v: boolean) => void
  workspaceHostScope: WorkspaceHostScope
  setWorkspaceHostScope: (scope: WorkspaceHostScope) => void
  visibleWorkspaceHostIds: VisibleWorkspaceHostIds
  setVisibleWorkspaceHostIds: (ids: VisibleWorkspaceHostIds) => void
  workspaceHostOrder: WorkspaceHostOrder
  setWorkspaceHostOrder: (ids: WorkspaceHostOrder) => void
  manualRepoOrder: ManualRepoOrderEntry[]
  hideDefaultBranchWorkspace: boolean
  setHideDefaultBranchWorkspace: (v: boolean) => void
  showDotfilesByWorktree: Record<string, boolean>
  setShowDotfilesForWorktree: (worktreeId: string, showDotfiles: boolean) => void
  toggleShowDotfilesForWorktree: (worktreeId: string) => void
  filterRepoIds: string[]
  setFilterRepoIds: (ids: string[]) => void
  collapsedGroups: Set<string>
  toggleCollapsedGroup: (key: string) => void
  worktreeCardProperties: WorktreeCardProperty[]
  setWorktreeCardProperties: (properties: readonly WorktreeCardProperty[]) => void
  agentActivityDisplayMode: AgentActivityDisplayMode
  workspaceStatuses: WorkspaceStatusDefinition[]
  setWorkspaceStatuses: (statuses: WorkspaceStatusDefinition[]) => void
  statusBarItems: StatusBarItem[]
  toggleStatusBarItem: (item: StatusBarItem) => void
  statusBarVisible: boolean
  setStatusBarVisible: (v: boolean) => void
  workspacePanelTitlebarPinnedIds: WorkspaceTitlebarActionId[]
  setWorkspacePanelTitlebarPinnedIds: (ids: readonly WorkspaceTitlebarActionId[]) => void
  usagePercentageDisplay: UsagePercentageDisplay
  setUsagePercentageDisplay: (display: UsagePercentageDisplay) => void
  statusBarUsageMode: StatusBarUsageMode
  setStatusBarUsageMode: (mode: StatusBarUsageMode) => void
}
