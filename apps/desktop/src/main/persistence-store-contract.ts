import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { FeatureInteractionId } from '~shared/feature-interactions'
import type { RateLimitHit, RateLimitResumeSchedule } from '~shared/rate-limit-resume/types'
import type {
  PersistedState,
  Project,
  ProjectUpdateArgs,
  ProjectHostSetup,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult,
  Repo,
  ProjectGroup,
  FolderWorkspace,
  SparsePreset,
  WorktreeMeta,
  WorktreeLineage,
  WorkspaceLineage,
  WorkspaceKey,
  GlobalSettings,
  OnboardingChecklistState,
  TerminalPaneLayoutNode,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '~shared/types'

import { StoreBase } from './persistence-store-base'
import type { CoworkingVisibilityCommitChange } from './persistence-store-types'

export abstract class StoreContract extends StoreBase {
  abstract flushOrThrow(): void
  abstract getRepos(): Repo[]
  abstract getProjects(): Project[]
  abstract updateProject(id: string, updates: ProjectUpdateArgs['updates']): Project | null
  abstract getProjectHostSetups(): ProjectHostSetup[]
  abstract createProjectHostSetup(
    args: ProjectHostSetupCreateArgs
  ): ProjectHostSetupCreateResult | null
  abstract updateProjectHostSetup(
    args: ProjectHostSetupUpdateArgs
  ): ProjectHostSetupUpdateResult | null
  abstract deleteProjectHostSetup(
    args: ProjectHostSetupDeleteArgs
  ): ProjectHostSetupDeleteResult | null
  abstract getRepoCount(): number
  abstract getRepo(id: string): Repo | undefined
  abstract getProjectGroups(): ProjectGroup[]
  abstract createProjectGroup(input: {
    name: string
    parentPath?: string | null
    connectionId?: string | null
    parentGroupId?: string | null
    createdFrom: ProjectGroup['createdFrom']
  }): ProjectGroup
  abstract updateProjectGroup(
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ): ProjectGroup | null
  abstract deleteProjectGroup(groupId: string): boolean
  abstract getFolderWorkspaces(): FolderWorkspace[]
  abstract getFolderWorkspace(id: string): FolderWorkspace | undefined
  abstract createFolderWorkspace(input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    linkedReview?: FolderWorkspace['linkedReview']
    connectionId?: string | null
    createdWithAgent?: FolderWorkspace['createdWithAgent']
    pendingFirstAgentMessageRename?: boolean
  }): FolderWorkspace
  abstract updateFolderWorkspace(
    id: string,
    updates: Partial<
      Pick<
        FolderWorkspace,
        | 'name'
        | 'folderPath'
        | 'linkedReview'
        | 'comment'
        | 'isArchived'
        | 'isUnread'
        | 'isPinned'
        | 'sortOrder'
        | 'manualOrder'
        | 'workspaceStatus'
        | 'createdWithAgent'
        | 'pendingFirstAgentMessageRename'
        | 'firstAgentMessageRenameError'
        | 'lastActivityAt'
      >
    >
  ): FolderWorkspace | null
  abstract removeFolderWorkspace(id: string): boolean
  abstract moveProjectToGroup(repoId: string, groupId: string | null, order?: number): Repo | null
  abstract addRepo(repo: Repo): void
  abstract reorderRepos(orderedIds: string[]): boolean
  abstract reorderReposForHost(orderedIds: string[], hostId: ExecutionHostId): boolean
  abstract removeProject(id: string): void
  abstract removeProjectForHost(id: string, hostId: ExecutionHostId): void
  protected abstract pruneWorktreeStateForRepo(id: string, hostId: ExecutionHostId | null): void
  abstract updateRepo(
    id: string,
    updates: Partial<
      Pick<
        Repo,
        | 'displayName'
        | 'badgeColor'
        | 'repoIcon'
        | 'upstream'
        | 'gitRemoteIdentity'
        | 'hookSettings'
        | 'worktreeBaseRef'
        | 'worktreeBasePath'
        | 'kind'
        | 'executionHostId'
        | 'symlinkPaths'
        | 'forgeRemotePreference'
        | 'forkSyncMode'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
        | 'projectHostSetupMethod'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  ): Repo | null
  protected abstract syncProjectHostSetupCompatibilityState(): void
  protected abstract updateRepoBackedProjectHostSetup(
    setup: ProjectHostSetup,
    repo: Repo,
    updates: ProjectHostSetupUpdateArgs['updates']
  ): { setup: ProjectHostSetup; repo: Repo } | null
  protected abstract updateIndependentProjectHostSetup(
    setup: ProjectHostSetup,
    updates: ProjectHostSetupUpdateArgs['updates']
  ): ProjectHostSetup
  protected abstract hydrateRepo(repo: Repo): Repo
  abstract getSparsePresets(repoId: string): SparsePreset[]
  abstract saveSparsePreset(preset: SparsePreset): SparsePreset
  abstract removeSparsePreset(repoId: string, presetId: string): void
  abstract listRateLimitResumes(): RateLimitResumeSchedule[]
  abstract createRateLimitResume(hit: RateLimitHit, resumeAt: number): RateLimitResumeSchedule
  abstract updateRateLimitResume(
    id: string,
    updates: Partial<Pick<RateLimitResumeSchedule, 'status' | 'firedAt' | 'failureReason'>>
  ): RateLimitResumeSchedule
  abstract deleteRateLimitResume(id: string): void
  abstract getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined
  abstract getAllWorktreeMeta(): Record<string, WorktreeMeta>
  abstract setWorktreeMeta(worktreeId: string, meta: Partial<WorktreeMeta>): WorktreeMeta
  abstract commitCoworkingVisibility(
    changes: readonly CoworkingVisibilityCommitChange[]
  ): readonly WorktreeMeta[]
  abstract removeWorktreeMeta(worktreeId: string): void
  abstract getWorktreeLineage(worktreeId: string): WorktreeLineage | undefined
  abstract getAllWorktreeLineage(): Record<string, WorktreeLineage>
  abstract setWorktreeLineage(worktreeId: string, lineage: WorktreeLineage): WorktreeLineage
  abstract removeWorktreeLineage(worktreeId: string): void
  abstract migrateWorktreeIdentity(oldWorktreeId: string, newWorktreeId: string): void
  abstract getWorkspaceLineage(childWorkspaceKey: WorkspaceKey): WorkspaceLineage | undefined
  abstract getAllWorkspaceLineage(): Record<WorkspaceKey, WorkspaceLineage>
  abstract setWorkspaceLineage(lineage: WorkspaceLineage): WorkspaceLineage
  abstract removeWorkspaceLineage(childWorkspaceKey: WorkspaceKey): void
  protected abstract removeWorkspaceLineageForFolderParent(folderWorkspaceId: string): void
  abstract getSettings(): GlobalSettings
  abstract onSettingsChanged(
    listener: (
      updates: Partial<GlobalSettings>,
      settings: GlobalSettings,
      originWebContentsId?: number
    ) => void
  ): () => void
  abstract onUIChanged(listener: (ui: PersistedState['ui']) => void): () => void
  abstract updateSettings(
    updates: Partial<GlobalSettings>,
    options?: { notifyListeners?: boolean; originWebContentsId?: number }
  ): GlobalSettings
  abstract getUI(): PersistedState['ui']
  abstract updateUI(updates: Partial<PersistedState['ui']>): void
  abstract recordFeatureInteraction(id: FeatureInteractionId): PersistedState['ui']
  abstract getOnboarding(): PersistedState['onboarding']
  abstract updateOnboarding(
    updates: Partial<Omit<PersistedState['onboarding'], 'checklist'>> & {
      checklist?: Partial<OnboardingChecklistState>
    }
  ): PersistedState['onboarding']
  abstract getGitHubCache(): PersistedState['githubCache']
  abstract setGitHubCache(cache: PersistedState['githubCache']): void
  protected abstract resolveHostId(hostId?: string | null): ExecutionHostId
  abstract getWorkspaceSession(hostId?: string | null): PersistedState['workspaceSession']
  abstract readTerminalScrollbackSnapshot(ref: string): string | null
  abstract getWorktreeIdForTab(tabId: string): string | undefined
  abstract setWorkspaceSession(
    session: PersistedState['workspaceSession'],
    hostId?: string | null
  ): void
  protected abstract setHostWorkspaceSession(
    hostId: ExecutionHostId,
    session: WorkspaceSessionState
  ): void
  protected abstract setLocalWorkspaceSession(session: PersistedState['workspaceSession']): void
  abstract patchWorkspaceSession(patch: WorkspaceSessionPatch, hostId?: string | null): void
  protected abstract getTerminalLayoutLeafIds(root: TerminalPaneLayoutNode | null): Set<string>
  abstract persistPtyBinding(args: {
    worktreeId: string
    worktreeInstanceId?: string | null
    tabId: string
    leafId: string
    ptyId: string
    startupCwd?: string
  }): void
  abstract getClaudeLivePtySessionIds(): string[]
  abstract addClaudeLivePtySessionId(sessionId: string): void
  abstract removeClaudeLivePtySessionId(sessionId: string): void
  abstract flush(): void
  abstract freezeWrites(): void
}
